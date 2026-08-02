import { describe, expect, it } from "vitest";
import { HELP, resolveHelp } from "./help.js";

describe("hierarchical help", () => {
  it.each([
    [["--help"], "root"], [["help"], "root"], [["help", "analyze"], "analyze"],
    [["analyze", "--help"], "analyze"], [["analyze", "options", "--help"], "options"],
    [["analyze", "status", "--help"], "status"], [["cost-profile", "--help"], "costProfile"],
    [["convert", "--help"], "convert"], [["doctor", "--help"], "doctor"], [["install", "--help"], "install"], [["update", "--help"], "update"],
  ])("resolves %j", (argv, topic) => expect(resolveHelp(argv)).toBe(topic));

  it("documents analysis-only behavior and local rates", () => {
    expect(HELP.root).toContain("不返回平台价格、交期");
    expect(HELP.root).toContain("五轴或人工报价路线不计算价格");
    expect(HELP.root).toContain("cost-profile");
    expect(HELP.install).toContain("cost_profile: missing");
    expect(HELP.costProfile).toContain("0600");
    expect(HELP.analyze).toContain("--compact-json");
    expect(HELP.analyze).toContain("保留全部零件");
    expect(HELP.analyze).toContain("--extract <section>");
    expect(HELP.analyze).toContain("工时统一为分钟");
    expect(HELP.analyze).not.toContain("兼容字段仍为小时");
    expect(HELP.analyze).not.toContain("--item");
    expect(HELP.root).toContain("最多每 24 小时检查一次 npm");
    expect(HELP.root).toContain("只提示，不自动安装");
    expect(HELP.root).toContain("倒角去毛刺四类 CNC 工时");
    expect(HELP.convert).toContain("cli-convert-json-v1");
    expect(HELP.convert).toContain("绝不覆盖");
  });
});
