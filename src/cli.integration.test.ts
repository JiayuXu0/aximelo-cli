import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const helpCommands = [
  ["--help"], ["help"], ["help", "analyze"], ["analyze", "--help"],
  ["analyze", "options", "--help"], ["analyze", "status", "--help"],
  ["cost-profile", "--help"], ["doctor", "--help"], ["install", "--help"], ["update", "--help"],
];

describe("CLI integration", () => {
  it.each(helpCommands)("%s exits zero without network or file access", async (...args) => {
    const isolatedHome = await mkdtemp(join(tmpdir(), "aximelo-help-home-"));
    const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: join(isolatedHome, ".config"), AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(20);
    expect(result.stderr).toBe("");
    await expect(access(join(isolatedHome, ".codex"))).rejects.toBeDefined();
  });

  it("prints stable version 1.0.4 without contacting the API", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "--version"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" } });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("1.0.4");
  });

  it("does not expose the retired standalone conversion command", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "convert", "part.x_t", "--output-dir", "out"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain("未知命令");
    expect(result.stderr).not.toContain("HOOPS");
  });

  it("rejects raw and compact JSON together before network access", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "analyze", "missing.step", "--json", "--compact-json"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { message: expect.stringContaining("互斥") } });
    expect(result.stderr).toBe("");
  });

  it.each([
    ["--json", "--extract", "route"],
    ["--compact-json", "--extract", "route"],
  ])("rejects mutually exclusive extraction output before network access", (...outputArgs) => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "analyze", "missing.step", ...outputArgs], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { message: expect.stringContaining("互斥") } });
    expect(result.stderr).toBe("");
  });

  it("rejects an unknown extraction category before file or network access", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "analyze", "missing.step", "--extract", "unknown"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { message: expect.stringContaining("overview") } });
    expect(result.stderr).toBe("");
  });

  it("rejects mutually exclusive stock flags before file or network access", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "analyze", "missing.step", "--stock-box", "20", "30", "40", "--stock-cylinder", "60", "25"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, AXIMELO_API_BASE_URL: "http://127.0.0.1:1" },
    });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain("互斥");
  });

  it("retires quote locally with exit code 4 and a migration message", () => {
    const result = spawnSync(process.execPath, ["dist/cli.js", "quote", "part.step", "--api-base", "http://127.0.0.1:1"], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain("不会发送网络请求");
    expect(result.stderr).toContain("aximelo analyze");
  });

  it("installs non-interactively without prompting and reports a missing cost profile", async () => {
    const isolatedHome = await mkdtemp(join(tmpdir(), "aximelo-install-home-"));
    const configRoot = join(isolatedHome, ".config");
    const result = spawnSync(process.execPath, ["dist/cli.js", "install", "--agent", "codex", "--json"], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: configRoot },
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({ ok: true, cost_profile: "missing" });
    expect(payload.capabilities).toContain("只上传明确指定的受支持单零件 CAD 文件，不扫描目录或相邻文件");
    expect(payload.capabilities).toContain("支持 STEP/STP 与受支持原生单零件作为制造分析输入；内部派生文件不对外下载");
    expect(payload.capabilities).toContain("最小毛坯形状/尺寸/体积/密度/重量");
    expect(payload.capabilities).toContain("多实体文件返回全部实体的整体长宽高、总体积和明确禁报原因，不返回加工或本地估价");
    expect(payload.capabilities).toContain("H2 原始总工时、六阶段工时，以及孔加工/粗加工/精加工/倒角去毛刺四类 CNC 工时");
    expect(payload.capabilities).toContain("仅对单实体、建议为三轴且存在有效装夹次数的结果做本地透明成本估算");
    await expect(access(join(isolatedHome, ".codex", "skills", "aximelo", "SKILL.md"))).resolves.toBeUndefined();
    await expect(access(join(configRoot, "aximelo", "cost-profile.json"))).rejects.toBeDefined();
  });

  it("explains capabilities and optional local estimate setup after install", async () => {
    const isolatedHome = await mkdtemp(join(tmpdir(), "aximelo-install-copy-home-"));
    const result = spawnSync(process.execPath, ["dist/cli.js", "install", "--agent", "codex"], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: join(isolatedHome, ".config") },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("只上传明确指定的受支持单零件 CAD 文件");
    expect(result.stdout).toContain("倒角去毛刺");
    expect(result.stdout).toContain("如需本地成本估算");
    expect(result.stdout).toContain("费率只保存在本机");
  });
});
