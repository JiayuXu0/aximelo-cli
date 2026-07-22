import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HELP, resolveHelp } from "./help.js";

describe("分级帮助", () => {
  it.each([
    [["--help"], "root"],
    [["help"], "root"],
    [["help", "quote"], "quote"],
    [["help", "quote", "options"], "options"],
    [["help", "quote", "status"], "status"],
    [["quote", "--help"], "quote"],
    [["quote", "-h"], "quote"],
    [["quote", "submit", "--help"], "quote"],
    [["quote", "options", "--help"], "options"],
    [["quote", "status", "--help"], "status"],
    [["doctor", "--help"], "doctor"],
    [["install", "--help"], "install"],
    [["help", "update"], "update"],
    [["update", "--help"], "update"],
  ])("解析 %j", (argv, topic) => {
    expect(resolveHelp(argv)).toBe(topic);
  });

  it("keeps help copy under stable snapshots", () => {
    expect(Object.fromEntries(Object.entries(HELP).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]))).toMatchInlineSnapshot(`
      {
        "doctor": "4f0555adfeb45b5eda29c2dd834c33cd39be08602d377483bb731a7e6289ae3c",
        "install": "ae642ef1c512c65575da9f724b94a3407e72a4e0b1103d3156dfd9976377c512",
        "options": "c39b2b60fbfc22f18ecb886e86df120baebfd1d71f09b42a6b9fbe48a4598c8e",
        "quote": "e86b65dc32cc71394ee7f002ec20fb2540c5d4f245787f23ffe6e436160fe5ff",
        "root": "287fd285e3f6382bd85398ca3e3f2174d4ccc11ab30f1565aac10c1cf535b2fd",
        "status": "79d753303341911a4e110bbc5c82b5b9845a70a29ed30473eb5e69afedcd8d7a",
        "update": "2ff51dfdb938fd2a9573cf98cb438b85da4c1265c17d3c72c62fb7e666fe8815",
      }
    `);
  });
});
