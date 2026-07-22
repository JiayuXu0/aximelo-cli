#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CliError,
  DEFAULT_API_BASE_URL,
  DEFAULT_RESULT_BASE_URL,
  isBatchTerminal,
  isQuoteTerminal,
  QuoteClient,
} from "./client.js";
import { CLI_VERSION, HELP, resolveHelp } from "./help.js";
import type { BatchQuoteResult, QuoteOptions, QuoteResult } from "./types.js";
import { checkForUpdate, installGlobalUpdate, type UpdateChannel } from "./update.js";

const rawArgs = process.argv.slice(2);
const helpTopic = resolveHelp(rawArgs);
if (helpTopic) {
  process.stdout.write(`${HELP[helpTopic]}\n`);
} else if (rawArgs.includes("--version")) {
  process.stdout.write(`${CLI_VERSION}\n`);
} else {
  await run(rawArgs);
}

async function run(inputArgs: string[]): Promise<void> {
  const args = [...inputArgs];
  const json = takeFlag(args, "--json");
  try {
    const apiBase = takeOption(args, "--api-base") ?? process.env.YOXIANG_API_BASE_URL ?? DEFAULT_API_BASE_URL;
    const resultBase = process.env.YOXIANG_RESULT_BASE_URL ?? DEFAULT_RESULT_BASE_URL;
    const client = new QuoteClient({ baseUrl: apiBase, resultBaseUrl: resultBase });
    const command = args.shift();

    if (command === "doctor") {
      assertNoExtraArgs(args, "yoxiang doctor --help");
      const options = await client.options();
      emit(json, { ok: true, api_base_url: apiBase, service: "reachable", options }, formatDoctor(options, apiBase));
      return;
    }

    if (command === "install") {
      const agent = takeOption(args, "--agent") ?? "codex";
      if (!isAgent(agent)) throw new CliError("--agent 仅支持 codex、claude 或 all。请运行 yoxiang install --help。", 4);
      assertNoExtraArgs(args, "yoxiang install --help");
      const paths = await installSkill(agent);
      emit(json, { ok: true, installed: paths }, `Skill 已安装：\n${paths.map((path) => `- ${path}`).join("\n")}`);
      return;
    }

    if (command === "update") {
      const checkOnly = takeFlag(args, "--check");
      const channel = takeOption(args, "--channel") ?? "next";
      const agent = takeOption(args, "--agent") ?? "codex";
      if (!isUpdateChannel(channel)) {
        throw new CliError("--channel 仅支持 next 或 latest。请运行 yoxiang update --help。", 4);
      }
      if (!isAgent(agent)) {
        throw new CliError("--agent 仅支持 codex、claude 或 all。请运行 yoxiang update --help。", 4);
      }
      assertNoExtraArgs(args, "yoxiang update --help");
      try {
        const check = await checkForUpdate(CLI_VERSION, channel);
        if (checkOnly) {
          emit(json, { ok: true, update: check }, formatUpdateCheck(check));
          return;
        }
        if (!check.update_available) {
          const paths = await installSkill(agent);
          emit(
            json,
            { ok: true, updated: false, update: check, skill_refreshed: paths },
            `${formatUpdateCheck(check)}\nSkill 已刷新：\n${paths.map((path) => `- ${path}`).join("\n")}`,
          );
          return;
        }
        process.stderr.write(`正在更新有象报价 CLI 到 ${check.target_version}，并刷新 Skill…\n`);
        const version = await installGlobalUpdate(channel, agent);
        emit(
          json,
          { ok: true, updated: true, previous_version: CLI_VERSION, version, channel, agent },
          `有象报价 CLI 已更新：${CLI_VERSION} -> ${version}\n${agent} Skill 已刷新。`,
        );
      } catch (error) {
        throw new CliError(
          `CLI 更新失败。请手动运行 npm install -g @yoxiang/quote-cli@${channel}，再运行 yoxiang install --agent ${agent}。`,
          5,
          error,
        );
      }
      return;
    }

    if (command !== "quote") throw new CliError(`未知命令：${command ?? ""}。请运行 yoxiang --help。`, 4);
    const first = args[0];
    if (first === "options") {
      args.shift();
      assertNoExtraArgs(args, "yoxiang quote options --help");
      const options = await client.options();
      emit(json, { ok: true, options }, formatOptions(options));
      return;
    }
    if (first === "status") {
      args.shift();
      const id = args.shift();
      const wait = takeFlag(args, "--wait");
      if (!id) throw new CliError("status 需要 batch-id 或兼容的 quote-id。请运行 yoxiang quote status --help。", 4);
      assertNoExtraArgs(args, "yoxiang quote status --help");
      const result = await statusAny(client, id, wait, json);
      if (isBatchResult(result)) emitBatchResult(json, result);
      else emitQuoteResult(json, result);
      return;
    }

    if (first === "submit") args.shift();
    const material = takeOption(args, "--material");
    const processName = takeOption(args, "--process");
    const quantity = positiveIntegerOption(takeOption(args, "--quantity"), "--quantity");
    const surfaceFinish = takeOption(args, "--surface-finish");
    const tolerance = takeOption(args, "--tolerance");
    const surfaceRoughness = takeOption(args, "--surface-roughness");
    const wait = takeFlag(args, "--wait");
    if (args.some((arg) => arg.startsWith("-"))) {
      throw new CliError(`无法识别参数：${args.filter((arg) => arg.startsWith("-")).join(" ")}。请运行 yoxiang quote --help。`, 4);
    }
    if (args.length === 0) throw new CliError("quote 需要至少一个明确的 STEP/STP 文件路径。请运行 yoxiang quote --help。", 4);

    process.stderr.write(`正在校验并提交 ${args.length} 个零件…\n`);
    let result = await client.submitBatch({
      filePaths: args,
      material,
      process: processName,
      quantity,
      surfaceFinish,
      tolerance,
      surfaceRoughness,
    });
    if (wait && !isBatchTerminal(result.status)) {
      process.stderr.write(`批次 ${result.batch_id} 已提交，等待分析…\n`);
      let previous = "";
      result = await client.waitBatch(result.batch_id, 10 * 60_000, (current) => {
        if (current.status !== previous) {
          process.stderr.write(`当前状态：${current.status}\n`);
          previous = current.status;
        }
      });
    }
    emitBatchResult(json, result);
  } catch (error: unknown) {
    const cliError = error instanceof CliError ? error : new CliError("命令执行失败。", 5, error);
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message: cliError.message, details: cliError.details } })}\n`);
    } else {
      process.stderr.write(`错误：${cliError.message}\n`);
    }
    process.exitCode = cliError.exitCode;
  }
}

async function statusAny(
  client: QuoteClient,
  id: string,
  wait: boolean,
  json: boolean,
): Promise<BatchQuoteResult | QuoteResult> {
  try {
    const batch = await client.batchStatus(id);
    if (wait && !isBatchTerminal(batch.status)) {
      return client.waitBatch(id, 10 * 60_000, (current) => {
        if (!json) process.stderr.write(`当前状态：${current.status}\n`);
      });
    }
    return batch;
  } catch (error) {
    if (!(error instanceof CliError) || error.exitCode !== 4) throw error;
    const quote = wait ? await client.wait(id) : await client.status(id);
    return quote;
  }
}

function emitBatchResult(json: boolean, result: BatchQuoteResult): void {
  const ok = result.status === "succeeded";
  emit(json, { ok, batch: result }, formatBatchResult(result));
  const statuses = result.items.map((item) => item.status);
  if (statuses.some((status) => status === "failed" || status === "expired")) process.exitCode = 5;
  else if (statuses.some((status) => status === "no_auto_quote")) process.exitCode = 2;
  else if (!isBatchTerminal(result.status)) process.exitCode = 3;
}

function emitQuoteResult(json: boolean, result: QuoteResult): void {
  emit(json, { ok: result.status === "succeeded", quote: result }, formatQuoteResult(result));
  if (result.status === "no_auto_quote") process.exitCode = 2;
  else if (result.status === "failed" || result.status === "expired") process.exitCode = 5;
  else if (!isQuoteTerminal(result.status)) process.exitCode = 3;
}

function emit(json: boolean, payload: unknown, human: string): void {
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
  if (!value || value.startsWith("--")) throw new CliError(`${name} 缺少值。`, 4);
  argv.splice(index, 2);
  return value;
}

function positiveIntegerOption(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new CliError(`${name} 必须是正整数。`, 4);
  return parsed;
}

function assertNoExtraArgs(argv: string[], help: string): void {
  if (argv.length > 0) throw new CliError(`无法识别参数：${argv.join(" ")}。请运行 ${help}。`, 4);
}

function isAgent(value: string): value is "codex" | "claude" | "all" {
  return value === "codex" || value === "claude" || value === "all";
}

function isUpdateChannel(value: string): value is UpdateChannel {
  return value === "next" || value === "latest";
}

function isBatchResult(result: BatchQuoteResult | QuoteResult): result is BatchQuoteResult {
  return "batch_id" in result;
}

async function installSkill(agent: "codex" | "claude" | "all"): Promise<string[]> {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = join(packageRoot, "skills", "yoxiang-part-quote");
  const targets: string[] = [];
  if (agent === "codex" || agent === "all") targets.push(join(homedir(), ".codex", "skills", "yoxiang-part-quote"));
  if (agent === "claude" || agent === "all") targets.push(join(homedir(), ".claude", "skills", "yoxiang-part-quote"));
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
  return targets;
}

function formatUpdateCheck(check: {
  channel: UpdateChannel;
  current_ahead: boolean;
  current_version: string;
  target_version: string;
  update_available: boolean;
}): string {
  const status = check.update_available
    ? "发现可用更新"
    : check.current_ahead
      ? "当前版本高于发布渠道"
      : "当前已是最新版本";
  return [
    status,
    `当前版本：${check.current_version}`,
    `${check.channel} 版本：${check.target_version}`,
  ].join("\n");
}

function formatDoctor(options: QuoteOptions, apiBase: string): string {
  return [
    "有象报价 CLI 状态正常",
    `API：${apiBase}`,
    `支持：${options.supported_extensions.join("、")}`,
    `单文件上限：${options.max_file_bytes.toLocaleString()} bytes（10 MiB）`,
    "默认：6061 / CNC / 1 件 / standard / ISO2768-m / Ra3.2",
  ].join("\n");
}

function formatOptions(options: QuoteOptions): string {
  return [
    "默认：6061 / cnc-machining / 1 件 / standard / ISO2768-m / Ra3.2",
    "可用材料：",
    ...options.materials.map((item) => `- ${item.value}: ${item.label}`),
    "可用工艺：",
    ...options.processes.map((item) => `- ${item.value}: ${item.label}`),
  ].join("\n");
}

function formatBatchResult(result: BatchQuoteResult): string {
  const lines = [
    `结果链接：${result.result_url ?? result.result_path}`,
    `批次：${result.batch_id}`,
    `状态：${result.status}`,
    "",
    "报价：",
  ];
  for (const item of result.items) {
    lines.push(`- ${item.file_name}（${item.status}）`);
    for (const price of item.price_options) lines.push(`  ${priceLabel(price.option_type)}：${price.currency} ${(price.total_price_cents / 100).toFixed(2)}，${price.lead_time_days} 天`);
  }
  lines.push("", "加工时间：");
  for (const item of result.items) {
    const total = item.machining_time_hours?.total_processing;
    lines.push(`- ${item.file_name}：${total === undefined ? "分析中或暂无数据" : `${total.toFixed(2)} 小时`}`);
  }
  const findings = result.items.flatMap((item) => publicFindings(item));
  lines.push("", "DFM / 异常：", ...(findings.length ? findings.map((finding) => `- ${finding}`) : ["- 暂无公开异常"]));
  return lines.join("\n");
}

function formatQuoteResult(result: QuoteResult): string {
  return formatBatchResult({
    batch_id: result.quote_id,
    status: result.status === "succeeded" ? "succeeded" : isQuoteTerminal(result.status) ? "completed_with_errors" : "processing",
    result_path: "",
    items: [result],
    requested_at: result.requested_at,
    expires_at: result.expires_at,
  });
}

function publicFindings(item: QuoteResult): string[] {
  if (item.error_code) return [`${item.file_name}：${item.error_code}`];
  const messages = [
    ...(item.dfm?.findings ?? []).map((finding) => finding.message_cn || finding.message_en || finding.code),
    ...(item.dfm?.warnings ?? []),
    ...(item.dfm?.suggestions ?? []),
  ].filter(Boolean);
  return [...new Set(messages)].map((message) => `${item.file_name}：${message}`);
}

function priceLabel(option: "economy" | "standard" | "express"): string {
  return { economy: "经济", standard: "标准", express: "加急" }[option];
}
