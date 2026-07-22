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
    await expect(inspectFile("part.txt")).rejects.toMatchObject({ exitCode: 4 });
  });
});

describe("QuoteClient", () => {
  it("polls until a terminal result", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ quote_id: "q1", status: "analyzing" }))
      .mockResolvedValueOnce(jsonResponse({ quote_id: "q1", status: "succeeded", prices: [] }));
    const client = new QuoteClient({ baseUrl: "https://example.test", fetchImpl, pollIntervalMs: 1 });

    await expect(client.wait("q1", 100)).resolves.toMatchObject({ status: "succeeded" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps server errors to stable CLI errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: "限流" } }, 429));
    const client = new QuoteClient({ baseUrl: "https://example.test", fetchImpl });

    await expect(client.options()).rejects.toEqual(expect.objectContaining<Partial<CliError>>({ message: "限流", exitCode: 4 }));
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
