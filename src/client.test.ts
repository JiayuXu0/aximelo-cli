import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CliError, inspectFile, QuoteClient } from "./client.js";

describe("inspectFile", () => {
  it("hashes an explicitly named STEP file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yoxiang-cli-"));
    const file = join(directory, "part.step");
    const content = "ISO-10303-21;\nEND-ISO-10303-21;\n";
    await writeFile(file, content);

    await expect(inspectFile(file)).resolves.toEqual({
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
            material: "AL6061",
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
        material: "AL6061",
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
      material: "AL6061",
      process: "cnc-machining",
      quantity: 3,
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://upload.example.test/part.stp",
    );
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      "https://api.example.test/v1/public/part-quotes/q1/complete",
    );
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
        exitCode: 4,
      }),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
