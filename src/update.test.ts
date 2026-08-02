import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkForUpdate, checkForUpdateNotice, compareVersions, installGlobalUpdate } from "./update.js";

describe("CLI version comparison", () => {
  it.each([
    ["0.5.1", "0.5.0", 1],
    ["0.5.0", "0.5.0-alpha.9", 1],
    ["0.5.0", "0.5.0", 0],
    ["0.4.9", "0.5.0", -1],
    ["1.0.0-alpha.2", "1.0.0-alpha.10", -1],
  ])("compares %s and %s", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });

  it("rejects invalid semantic versions", () => {
    expect(() => compareVersions("stable", "0.5.0")).toThrow("invalid semantic version");
  });

  it("checks the selected npm dist-tag without installing", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ "dist-tags": { latest: "0.5.1" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server failed to listen");
    try {
      await expect(
        checkForUpdate("0.5.0", "latest", `http://127.0.0.1:${address.port}`),
      ).resolves.toEqual({
        channel: "latest",
        current_ahead: false,
        current_version: "0.5.0",
        target_version: "0.5.1",
        update_available: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("reuses a fresh cached update notice without contacting the registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "aximelo-update-notice-cache-"));
    const cachePath = join(root, "update-check.json");
    await writeFile(cachePath, JSON.stringify({
      checked_at_ms: 1000,
      current_version: "0.6.1",
      latest_version: "0.6.2",
      update_available: true,
    }));

    await expect(checkForUpdateNotice("0.6.1", {
      cachePath,
      nowMs: 2000,
      registry: "http://127.0.0.1:1",
    })).resolves.toEqual({
      update_available: true,
      current_version: "0.6.1",
      latest_version: "0.6.2",
      command: "aximelo update --agent codex",
    });
  });

  it("checks a stale cache once and persists the result for later requests", async () => {
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ "dist-tags": { latest: "0.6.2" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server failed to listen");
    const root = await mkdtemp(join(tmpdir(), "aximelo-update-notice-refresh-"));
    const cachePath = join(root, "update-check.json");
    const registry = `http://127.0.0.1:${address.port}`;
    try {
      const first = await checkForUpdateNotice("0.6.1", { cachePath, nowMs: 100_000, registry });
      const second = await checkForUpdateNotice("0.6.1", { cachePath, nowMs: 101_000, registry });
      expect(first).toMatchObject({ latest_version: "0.6.2" });
      expect(second).toEqual(first);
      expect(requestCount).toBe(1);
      expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({
        current_version: "0.6.1",
        latest_version: "0.6.2",
        update_available: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("fails open and caches a registry failure without breaking the caller", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 503;
      response.end("unavailable");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server failed to listen");
    const root = await mkdtemp(join(tmpdir(), "aximelo-update-notice-failure-"));
    const cachePath = join(root, "update-check.json");
    try {
      await expect(checkForUpdateNotice("0.6.1", {
        cachePath,
        nowMs: 100_000,
        registry: `http://127.0.0.1:${address.port}`,
      })).resolves.toBeUndefined();
      expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({
        current_version: "0.6.1",
        check_failed: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("installs the selected channel and refreshes the requested Skill", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(join(tmpdir(), "aximelo-update-"));
    const bin = join(root, "bin");
    const globalRoot = join(root, "global");
    const invocationLog = join(root, "updated-cli.log");
    const npmLog = join(root, "npm.log");
    const updatedCLI = join(globalRoot, "@aximelo", "cli", "dist", "cli.js");
    await mkdir(bin, { recursive: true });
    await mkdir(join(globalRoot, "@aximelo", "cli", "dist"), { recursive: true });
    await writeFile(
      join(bin, "npm"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}\nif [ "$1" = "root" ]; then printf '%s\\n' ${JSON.stringify(globalRoot)}; fi\n`,
      "utf8",
    );
    await chmod(join(bin, "npm"), 0o755);
    await writeFile(
      updatedCLI,
      `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(invocationLog)}, process.argv.slice(2).join(" ") + "\\n");\nif (process.argv.includes("--version")) process.stdout.write("0.5.1\\n");\nelse process.stdout.write('{"ok":true}\\n');\n`,
      "utf8",
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${bin}:${previousPath ?? ""}`;
    try {
      await expect(installGlobalUpdate("latest", "codex", "https://registry.example")).resolves.toBe(
        "0.5.1",
      );
      expect(await readFile(npmLog, "utf8")).toContain(
        "install --global @aximelo/cli@latest --registry=https://registry.example",
      );
      expect(await readFile(invocationLog, "utf8")).toContain("install --agent codex --json");
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
