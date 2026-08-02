import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AnalysisClient, CliError, inspectFile, inspectFiles, MAX_CONCURRENT_PARTS, MAX_FILE_BYTES } from "./client.js";

describe("explicit STEP file validation", () => {
  it("hashes an explicitly named STEP file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-cli-"));
    const file = join(directory, "part.step");
    const content = "ISO-10303-21;\nEND-ISO-10303-21;\n";
    await writeFile(file, content);
    await expect(inspectFile(file)).resolves.toMatchObject({
      name: "part.step",
      size: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  });

  it("accepts native parts and rejects unsupported files, directories, duplicates, and oversized files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-cli-paths-"));
    const file = join(directory, "part.step");
    const alias = join(directory, "alias.step");
    const folder = join(directory, "folder.step");
    const tooLarge = join(directory, "large.stp");
    await writeFile(file, "ISO-10303-21;");
    const native = join(directory, "part.x_t");
    await writeFile(native, "parasolid");
    await symlink(file, alias);
    await mkdir(folder);
    await writeFile(tooLarge, Buffer.alloc(MAX_FILE_BYTES + 1));
    await expect(inspectFile("part.txt")).rejects.toMatchObject({ exitCode: 4 });
    await expect(inspectFile("assembly.sldasm")).rejects.toMatchObject({ exitCode: 4 });
    await expect(inspectFile(native)).resolves.toMatchObject({ name: "part.x_t" });
    await expect(inspectFile(folder)).rejects.toMatchObject({ exitCode: 4 });
    await expect(inspectFiles([file, alias])).rejects.toMatchObject({ exitCode: 4 });
    await expect(inspectFile(tooLarge)).rejects.toMatchObject({ exitCode: 4 });
  });

  it("accepts exactly 10 MiB and rejects a sixth file before reading", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-cli-limit-"));
    const accepted = join(directory, "accepted.STEP");
    await writeFile(accepted, Buffer.alloc(MAX_FILE_BYTES, 65));
    await expect(inspectFile(accepted)).resolves.toMatchObject({ size: MAX_FILE_BYTES });
    await expect(inspectFiles(Array.from({ length: 6 }, (_, index) => `missing-${index}.step`))).rejects.toMatchObject({
      exitCode: 4,
      message: expect.stringContaining("最多同时分析 5 个零件"),
    });
  });
});

describe("AnalysisClient", () => {
  it("hides internal CAD preprocessing details from public options and results", async () => {
    const result = batchResult("b1", "completed_with_gaps");
    result.items = [{
      analysis_id: "a1", status: "completed_with_gaps", file_name: "part.x_t", source_format: "x_t",
      material: "6061", process: "cnc-machining", conversion: { status: "failed", error_code: "CAD_CONVERSION_FAILED" },
      components: {
        geometry: { status: "failed", error_code: "CAD_CONVERSION_FAILED" }, dfm: { status: "unavailable" },
        machining: { status: "unavailable" }, preview: { status: "unavailable" },
      }, requested_at: "2026-07-23T00:00:00Z", expires_at: "2026-07-30T00:00:00Z",
    }];
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        supported_extensions: [".step", ".x_t"], passthrough_extensions: [".step"], conversion_extensions: [".x_t"],
        max_file_bytes: MAX_FILE_BYTES, materials: [], processes: [],
      }))
      .mockResolvedValueOnce(jsonResponse(result));
    const client = new AnalysisClient({ baseUrl: "https://api.example.test", fetchImpl });
    const options = await client.options();
    expect(options).not.toHaveProperty("passthrough_extensions");
    expect(options).not.toHaveProperty("conversion_extensions");
    const status = await client.batchStatus("b1");
    expect(status.items[0]).not.toHaveProperty("conversion");
    expect(status.items[0]?.components.geometry.error_code).toBe("CAD_INPUT_PROCESSING_FAILED");
    expect(JSON.stringify(status)).not.toContain("CAD_CONVERSION_FAILED");
  });

  it("creates one batch, uploads explicit files, and completes the analysis contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-analysis-submit-"));
    const first = join(directory, "first.step");
    const second = join(directory, "second.stp");
    const adjacent = join(directory, "adjacent.step");
    await writeFile(first, "ISO-10303-21;first");
    await writeFile(second, "ISO-10303-21;second");
    await writeFile(adjacent, "ISO-10303-21;adjacent");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        batch_id: "b1",
        status: "awaiting_upload",
        result_path: "/tools/part-analysis/results/b1",
        items: [uploadIntent("a1", "first.step"), uploadIntent("a2", "second.stp")],
        expires_at: "2026-07-30T00:00:00Z",
      }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(batchResult("b1", "processing"), 202));
    const client = new AnalysisClient({ baseUrl: "https://api.example.test", fetchImpl });

    await expect(client.submitBatch({ filePaths: [first, second], process: "cnc", stock: { shape: "block", size_mm: [20, 868, 175] } })).resolves.toMatchObject({
      batch_id: "b1",
      result_url: "https://app.aximelo.ai/zh/tools/part-analysis/results/b1",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.example.test/v1/public/part-analysis-batches");
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toHaveProperty("idempotency-key");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ material: "6061", process: "cnc-machining", tolerance: "ISO2768-m", surface_roughness: "Ra3.2" });
    expect(body.files.map((file: { file_name: string }) => file.file_name)).toEqual(["first.step", "second.stp"]);
    expect(body.files.map((file: { stock: unknown }) => file.stock)).toEqual([
      { shape: "block", size_mm: [20, 868, 175] },
      { shape: "block", size_mm: [20, 868, 175] },
    ]);
    expect(body).not.toHaveProperty("quantity");
    expect(body).not.toHaveProperty("surface_finish");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("adjacent.step");
    expect(fetchImpl.mock.calls[3]?.[0]).toBe("https://api.example.test/v1/public/part-analysis-batches/b1/complete");
  });

  it("validates the complete batch before any request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-analysis-validation-"));
    const good = join(directory, "good.step");
    const bad = join(directory, "bad.step");
    await writeFile(good, "ISO-10303-21;");
    await writeFile(bad, Buffer.alloc(MAX_FILE_BYTES + 1));
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new AnalysisClient({ baseUrl: "https://api.example.test", fetchImpl });
    await expect(client.submitBatch({ filePaths: [good, bad] })).rejects.toMatchObject({ exitCode: 4 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid explicit stock before any request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-analysis-stock-"));
    const file = join(directory, "part.step");
    await writeFile(file, "ISO-10303-21;");
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new AnalysisClient({ baseUrl: "https://api.example.test", fetchImpl });
    await expect(client.submitBatch({
      filePaths: [file],
      stock: { shape: "cylinder", diameter_mm: 60, length_mm: 0 },
    })).rejects.toMatchObject({ exitCode: 4 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses five concurrent upload workers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aximelo-analysis-five-"));
    const files = await Promise.all(Array.from({ length: MAX_CONCURRENT_PARTS }, async (_, index) => {
      const file = join(directory, `part-${index}.step`);
      await writeFile(file, `ISO-10303-21;${index}`);
      return file;
    }));
    let active = 0;
    let maximum = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/public/part-analysis-batches")) return jsonResponse({
        batch_id: "b5", status: "awaiting_upload", result_path: "/tools/part-analysis/results/b5",
        items: files.map((file, index) => uploadIntent(`a${index}`, file)), expires_at: "2026-07-30T00:00:00Z",
      }, 201);
      if (url.includes("upload.example.test")) {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return new Response(null, { status: 200 });
      }
      return jsonResponse(batchResult("b5", "processing"), 202);
    });
    await new AnalysisClient({ baseUrl: "https://api.example.test", fetchImpl }).submitBatch({ filePaths: files });
    expect(maximum).toBe(5);
  });

  it("polls until completed_with_gaps and preserves component errors", async () => {
    const final = batchResult("b1", "completed_with_gaps");
    final.items = [{
      analysis_id: "a1", status: "completed_with_gaps", file_name: "part.step", material: "6061", process: "cnc-machining",
      components: {
        geometry: { status: "succeeded" }, dfm: { status: "succeeded" },
        machining: { status: "failed", error_code: "autocam_failed" }, preview: { status: "succeeded" },
      }, requested_at: "2026-07-23T00:00:00Z", expires_at: "2026-07-30T00:00:00Z",
    }];
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(batchResult("b1", "processing")))
      .mockResolvedValueOnce(jsonResponse(final));
    const client = new AnalysisClient({ baseUrl: "https://example.test", fetchImpl, pollIntervalMs: 1 });
    await expect(client.waitBatch("b1", 100)).resolves.toMatchObject({ status: "completed_with_gaps", items: [{ components: { machining: { error_code: "autocam_failed" } } }] });
  });

  it("maps service errors to stable CLI errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: "限流" } }, 429));
    await expect(new AnalysisClient({ baseUrl: "https://example.test", fetchImpl }).options()).rejects.toEqual(expect.objectContaining<Partial<CliError>>({ message: "限流", exitCode: 5 }));
  });
});

function uploadIntent(analysisId: string, name: string) {
  return { analysis_id: analysisId, status: "awaiting_upload", upload_url: `https://upload.example.test/${name}`, upload_method: "PUT", required_headers: { "content-type": "model/step" }, upload_expires_at: "2026-07-23T00:15:00Z", expires_at: "2026-07-30T00:00:00Z" };
}

function batchResult(batchId: string, status: "processing" | "completed_with_gaps") {
  return { batch_id: batchId, status, result_path: `/tools/part-analysis/results/${batchId}`, items: [], requested_at: "2026-07-23T00:00:00Z", expires_at: "2026-07-30T00:00:00Z" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
