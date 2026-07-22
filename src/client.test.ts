import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CliError, inspectFile, inspectFiles, MAX_FILE_BYTES, QuoteClient } from "./client.js";

describe("inspectFile", () => {
  it("hashes an explicitly named STEP file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-"));
    const file = join(directory, "part.step");
    const content = "ISO-10303-21;\nEND-ISO-10303-21;\n";
    await writeFile(file, content);

    await expect(inspectFile(file)).resolves.toMatchObject({
      name: "part.step",
      size: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  });

  it("rejects non-STEP files", async () => {
    await expect(inspectFile("part.txt")).rejects.toMatchObject({
      exitCode: 4,
    });
  });

  it("accepts exactly 10 MiB and rejects one byte over", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-limit-"));
    const accepted = join(directory, "accepted.STEP");
    const rejected = join(directory, "rejected.stp");
    await writeFile(accepted, Buffer.alloc(MAX_FILE_BYTES, 65));
    await writeFile(rejected, Buffer.alloc(MAX_FILE_BYTES + 1, 65));
    await expect(inspectFile(accepted)).resolves.toMatchObject({ size: MAX_FILE_BYTES });
    await expect(inspectFile(rejected)).rejects.toMatchObject({ exitCode: 4 });
  });

  it("rejects directories and duplicate real files reached through a symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-paths-"));
    const nested = join(directory, "nested.step");
    const link = join(directory, "alias.step");
    await mkdir(join(directory, "folder.step"));
    await writeFile(nested, "ISO-10303-21;");
    await symlink(nested, link);
    await expect(inspectFile(join(directory, "folder.step"))).rejects.toMatchObject({ exitCode: 4 });
    await expect(inspectFiles([nested, link])).rejects.toMatchObject({ exitCode: 4 });
  });
});

describe("QuoteClient", () => {
  it("creates, uploads, and completes a quote with the public API contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-submit-"));
    const file = join(directory, "part.stp");
    const content = "ISO-10303-21;\nEND-ISO-10303-21;\n";
    await writeFile(file, content);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            quote_id: "q1",
            status: "awaiting_upload",
            upload_url: "https://upload.example.test/part.stp",
            upload_method: "PUT",
            required_headers: { "content-type": "model/step" },
            upload_expires_at: "2026-07-22T12:15:00Z",
            expires_at: "2026-07-29T12:00:00Z",
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            quote_id: "q1",
            status: "queued",
            file_name: "part.stp",
            quantity: 3,
            material: "6061",
            process: "cnc-machining",
            price_options: [],
            requested_at: "2026-07-22T12:00:00Z",
            expires_at: "2026-07-29T12:00:00Z",
          },
          202,
        ),
      );
    const client = new QuoteClient({
      baseUrl: "https://api.example.test",
      fetchImpl,
    });

    await expect(
      client.submit({
        filePath: file,
        material: "6061",
        process: "cnc-machining",
        quantity: 3,
      }),
    ).resolves.toMatchObject({ quote_id: "q1", status: "queued" });

    const createInit = fetchImpl.mock.calls[0]?.[1];
    expect(createInit?.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(createInit?.headers).toHaveProperty("idempotency-key");
    expect(JSON.parse(String(createInit?.body))).toMatchObject({
      file_name: "part.stp",
      file_size: Buffer.byteLength(content),
      checksum: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      material: "6061",
      process: "cnc-machining",
      quantity: 3,
      surface_finish: "standard",
      tolerance: "ISO2768-m",
      surface_roughness: "Ra3.2",
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://upload.example.test/part.stp",
    );
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      "https://api.example.test/v1/public/part-quotes/q1/complete",
    );
  });

  it("validates the whole batch before any request and uploads only explicit paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-batch-"));
    const first = join(directory, "first.step");
    const second = join(directory, "second.stp");
    const adjacent = join(directory, "adjacent.step");
    await writeFile(first, "ISO-10303-21;first");
    await writeFile(second, "ISO-10303-21;second");
    await writeFile(adjacent, "ISO-10303-21;adjacent");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        batch_id: "b1", status: "awaiting_upload", result_path: "/tools/quote-cli/results/b1",
        items: [uploadIntent("q1", "first.step"), uploadIntent("q2", "second.stp")],
        expires_at: "2026-07-29T12:00:00Z",
      }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({
        batch_id: "b1", status: "processing", result_path: "/tools/quote-cli/results/b1", items: [],
        requested_at: "2026-07-22T12:00:00Z", expires_at: "2026-07-29T12:00:00Z",
      }, 202));
    const client = new QuoteClient({ baseUrl: "https://api.example.test", fetchImpl });

    await expect(client.submitBatch({ filePaths: [first, second] })).resolves.toMatchObject({
      batch_id: "b1",
      result_url: "https://test.yoxiang.cn/zh/tools/quote-cli/results/b1",
    });
    const createBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(createBody.files.map((file: { file_name: string }) => file.file_name)).toEqual(["first.step", "second.stp"]);
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("adjacent.step");

    const invalidFetch = vi.fn<typeof fetch>();
    const invalidClient = new QuoteClient({ baseUrl: "https://api.example.test", fetchImpl: invalidFetch });
    const tooLarge = join(directory, "large.step");
    await writeFile(tooLarge, Buffer.alloc(MAX_FILE_BYTES + 1));
    await expect(invalidClient.submitBatch({ filePaths: [first, tooLarge] })).rejects.toMatchObject({ exitCode: 4 });
    expect(invalidFetch).not.toHaveBeenCalled();
  });

  it("polls until a terminal result", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ quote_id: "q1", status: "analyzing" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ quote_id: "q1", status: "succeeded", prices: [] }),
      );
    const client = new QuoteClient({
      baseUrl: "https://example.test",
      fetchImpl,
      pollIntervalMs: 1,
    });

    await expect(client.wait("q1", 100)).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps server errors to stable CLI errors", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { message: "限流" } }, 429));
    const client = new QuoteClient({
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await expect(client.options()).rejects.toEqual(
      expect.objectContaining<Partial<CliError>>({
        message: "限流",
        exitCode: 5,
      }),
    );
  });
});

function uploadIntent(quoteId: string, name: string) {
  return {
    quote_id: quoteId,
    status: "awaiting_upload",
    upload_url: `https://upload.example.test/${name}`,
    upload_method: "PUT",
    required_headers: { "content-type": "model/step" },
    upload_expires_at: "2026-07-22T12:15:00Z",
    expires_at: "2026-07-29T12:00:00Z",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
