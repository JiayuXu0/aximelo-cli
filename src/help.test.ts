import { describe, expect, it } from "vitest";
import { HELP, resolveHelp } from "./help.js";

describe("hierarchical help", () => {
  it.each([
    [["--help"], "root"], [["help"], "root"], [["help", "analyze"], "analyze"],
    [["analyze", "--help"], "analyze"], [["analyze", "options", "--help"], "options"],
    [["analyze", "status", "--help"], "status"], [["cost-profile", "--help"], "costProfile"],
    [["doctor", "--help"], "doctor"], [["install", "--help"], "install"], [["update", "--help"], "update"],
  ])("resolves %j", (argv, topic) => expect(resolveHelp(argv)).toBe(topic));

  it("documents analysis-only behavior and local rates", () => {
    expect(HELP.root).toContain("不返回价格、交期");
    expect(HELP.root).toContain("cost-profile");
    expect(HELP.install).toContain("cost_profile: missing");
    expect(HELP.costProfile).toContain("0600");
  });
});
