import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const helpCommands = [
  ["--help"],
  ["help"],
  ["help", "quote"],
  ["help", "quote", "options"],
  ["help", "quote", "status"],
  ["quote", "--help"],
  ["quote", "-h"],
  ["quote", "submit", "--help"],
  ["quote", "options", "--help"],
  ["quote", "status", "--help"],
  ["doctor", "--help"],
  ["install", "--help"],
];

describe("CLI help integration", () => {
  it.each(helpCommands)("%s exits zero without network or file access", async (...args) => {
    const isolatedHome = await mkdtemp(join(tmpdir(), "yoxiang-help-home-"));
    const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: isolatedHome,
        YOXIANG_API_BASE_URL: "http://127.0.0.1:1",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(20);
    expect(result.stderr).toBe("");
    await expect(access(join(isolatedHome, ".codex"))).rejects.toBeDefined();
  });

  it("prints the package version without contacting the API", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, YOXIANG_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("0.2.0-next.0");
    expect(result.stderr).toBe("");
  });

  it("recommends command help for unknown arguments", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "quote", "--unknown"], {
      cwd: process.cwd(), encoding: "utf8",
    });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain("yoxiang quote --help");
  });
});
