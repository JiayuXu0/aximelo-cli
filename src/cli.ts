#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, DEFAULT_API_BASE_URL, QuoteClient } from "./client.js";
import type { QuoteOptions, QuoteResult } from "./types.js";

const args = process.argv.slice(2);
const json = takeFlag(args, "--json");
const apiBase =
  takeOption(args, "--api-base") ??
  process.env.YOXIANG_API_BASE_URL ??
  DEFAULT_API_BASE_URL;
const client = new QuoteClient({ baseUrl: apiBase });

main(args).catch((error: unknown) => {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError("命令执行失败。", 5, error);
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { message: cliError.message, details: cliError.details } })}\n`,
    );
  } else {
    process.stderr.write(`错误：${cliError.message}\n`);
  }
  process.exitCode = cliError.exitCode;
});

async function main(argv: string[]): Promise<void> {
  const command = argv.shift();
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    return;
  }

  if (command === "doctor") {
    const options = await client.options();
    emit(
      { ok: true, api_base_url: apiBase, service: "reachable", options },
      formatDoctor(options),
    );
    return;
  }

  if (command === "install") {
    const agent = takeOption(argv, "--agent") ?? "codex";
    if (!isAgent(agent))
      throw new CliError("--agent 仅支持 codex、claude 或 all。", 4);
    const paths = await installSkill(agent);
    emit(
      { ok: true, installed: paths },
      `Skill 已安装：\n${paths.map((path) => `- ${path}`).join("\n")}`,
    );
    return;
  }

  if (command !== "quote") throw new CliError(`未知命令：${command}`, 4);
  const subcommand = argv.shift();

  if (subcommand === "options") {
    const options = await client.options();
    emit({ ok: true, options }, formatOptions(options));
    return;
  }

  if (subcommand === "submit") {
    const filePath = argv.shift();
    const material = takeOption(argv, "--material");
    const processName = takeOption(argv, "--process");
    const rawQuantity = takeOption(argv, "--quantity");
    const wait = takeFlag(argv, "--wait");
    if (!filePath || !material || !processName || !rawQuantity) {
      throw new CliError(
        "submit 需要文件、--material、--process 和 --quantity。",
        4,
      );
    }
    const quantity = Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new CliError("--quantity 必须是正整数。", 4);
    assertNoExtraArgs(argv);
    if (!json) process.stderr.write("正在上传并提交零件…\n");
    let result = await client.submit({
      filePath,
      material,
      process: processName,
      quantity,
    });
    if (wait && !isTerminal(result.status)) {
      if (!json)
        process.stderr.write(`任务 ${result.quote_id} 已排队，等待分析…\n`);
      result = await client.wait(result.quote_id);
    }
    emitResult(result);
    return;
  }

  if (subcommand === "status") {
    const quoteId = argv.shift();
    if (!quoteId) throw new CliError("status 需要 quote-id。", 4);
    const wait = takeFlag(argv, "--wait");
    assertNoExtraArgs(argv);
    const result = wait
      ? await client.wait(quoteId)
      : await client.status(quoteId);
    emitResult(result);
    return;
  }

  throw new CliError(`未知 quote 子命令：${subcommand ?? ""}`, 4);
}

function emitResult(result: QuoteResult): void {
  emit(
    { ok: result.status === "succeeded", quote: result },
    formatResult(result),
  );
  if (result.status === "no_auto_quote") process.exitCode = 2;
  else if (result.status === "failed" || result.status === "expired")
    process.exitCode = 5;
  else if (!isTerminal(result.status)) process.exitCode = 3;
}

function emit(payload: unknown, human: string): void {
  process.stdout.write(json ? `${JSON.stringify(payload)}\n` : `${human}\n`);
}

function takeFlag(argv: string[], name: string): boolean {
  const index = argv.indexOf(name);
  if (index < 0) return false;
  argv.splice(index, 1);
  return true;
}

function takeOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new CliError(`${name} 缺少值。`, 4);
  argv.splice(index, 2);
  return value;
}

function assertNoExtraArgs(argv: string[]): void {
  if (argv.length > 0) throw new CliError(`无法识别参数：${argv.join(" ")}`, 4);
}

function isTerminal(status: QuoteResult["status"]): boolean {
  return ["succeeded", "no_auto_quote", "failed", "expired"].includes(status);
}

function isAgent(value: string): value is "codex" | "claude" | "all" {
  return value === "codex" || value === "claude" || value === "all";
}

async function installSkill(
  agent: "codex" | "claude" | "all",
): Promise<string[]> {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = join(packageRoot, "skills", "yoxiang-part-quote");
  const targets: string[] = [];
  if (agent === "codex" || agent === "all")
    targets.push(join(homedir(), ".codex", "skills", "yoxiang-part-quote"));
  if (agent === "claude" || agent === "all")
    targets.push(join(homedir(), ".claude", "skills", "yoxiang-part-quote"));
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
  return targets;
}

function formatDoctor(options: QuoteOptions): string {
  return [
    "有象报价 CLI 状态正常",
    `API：${apiBase}`,
    `支持：${options.supported_extensions.join("、")}`,
    `文件上限：${Math.round(options.max_file_bytes / 1024 / 1024)} MB`,
  ].join("\n");
}

function formatOptions(options: QuoteOptions): string {
  return [
    "可用材料：",
    ...options.materials.map((item) => `- ${item.value}: ${item.label}`),
    "可用工艺：",
    ...options.processes.map((item) => `- ${item.value}: ${item.label}`),
  ].join("\n");
}

function formatResult(result: QuoteResult): string {
  const lines = [`报价任务：${result.quote_id}`, `状态：${result.status}`];
  if (result.price_options.length) {
    const labels = {
      economy: "经济",
      standard: "标准",
      express: "加急",
    } as const;
    lines.push(
      "价格：",
      ...result.price_options.map(
        (price) =>
          `- ${labels[price.option_type]}：${price.currency} ${(price.total_price_cents / 100).toFixed(2)}，${price.lead_time_days} 天`,
      ),
    );
  }
  if (result.dfm) {
    const findings = [
      ...(result.dfm.warnings ?? []),
      ...(result.dfm.suggestions ?? []),
    ];
    if (findings.length)
      lines.push("DFM 建议：", ...findings.map((finding) => `- ${finding}`));
  }
  if (result.error_code) lines.push(`说明：${result.error_code}`);
  return lines.join("\n");
}

function printHelp(): void {
  process.stdout.write(
    `有象零件报价 CLI\n\n用法：\n  yoxiang quote options\n  yoxiang quote submit <file.step> --material <code> --process <code> --quantity <n> [--wait] [--json]\n  yoxiang quote status <quote-id> [--wait] [--json]\n  yoxiang doctor\n  yoxiang install --agent codex|claude|all\n\n全局参数：\n  --api-base <url>  覆盖报价 API 地址\n  --json            输出单个 JSON 对象\n`,
  );
}
