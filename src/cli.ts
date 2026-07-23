#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  AnalysisClient,
  CliError,
  DEFAULT_API_BASE_URL,
  DEFAULT_RESULT_BASE_URL,
  isBatchTerminal,
} from "./client.js";
import {
  configureCostProfile,
  costProfilePath,
  loadCostProfile,
  setMaterialPrice,
  setStockAdjustment,
  type ConfigureCostProfileInput,
  type CostProfile,
} from "./cost-profile.js";
import { CLI_VERSION, HELP, resolveHelp } from "./help.js";
import type { AnalysisBatchResult, AnalysisOptions, AnalysisResult } from "./types.js";
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
    const command = args.shift();

    // The retired command deliberately exits before constructing a client or issuing a request.
    if (command === "quote") {
      throw new CliError("yoxiang quote 已停用且不会发送网络请求。请改用 yoxiang analyze；如需报价，由 Agent 读取本地 cost-profile 后计算。", 4);
    }

    if (command === "cost-profile") {
      await runCostProfile(args, json);
      return;
    }

    if (command === "install") {
      const agent = takeOption(args, "--agent") ?? "codex";
      if (!isAgent(agent)) throw new CliError("--agent 仅支持 codex、claude 或 all。请运行 yoxiang install --help。", 4);
      assertNoExtraArgs(args, "yoxiang install --help");
      const paths = await installSkill(agent);
      const interactive = !json && process.stdin.isTTY && process.stdout.isTTY;
      if (interactive) {
        process.stdout.write(`可用原子能力：\n${atomicCapabilities().map((item) => `- ${item}`).join("\n")}\n\n`);
      }
      const profileState = await ensureInstallCostProfile(json);
      const payload = {
        ok: true,
        installed: paths,
        cost_profile: profileState,
        cost_profile_path: costProfilePath(),
        capabilities: atomicCapabilities(),
      };
      emit(json, payload, formatInstall(paths, profileState, !interactive));
      return;
    }

    if (command === "update") {
      const checkOnly = takeFlag(args, "--check");
      const channel = takeOption(args, "--channel") ?? "next";
      const agent = takeOption(args, "--agent") ?? "codex";
      if (!isUpdateChannel(channel)) throw new CliError("--channel 仅支持 next 或 latest。请运行 yoxiang update --help。", 4);
      if (!isAgent(agent)) throw new CliError("--agent 仅支持 codex、claude 或 all。请运行 yoxiang update --help。", 4);
      assertNoExtraArgs(args, "yoxiang update --help");
      try {
        const check = await checkForUpdate(CLI_VERSION, channel);
        if (checkOnly) {
          emit(json, { ok: true, update: check }, formatUpdateCheck(check));
          return;
        }
        if (!check.update_available) {
          const paths = await installSkill(agent);
          emit(json, { ok: true, updated: false, update: check, skill_refreshed: paths }, `${formatUpdateCheck(check)}\nSkill 已刷新；本地成本配置未改动。`);
          return;
        }
        process.stderr.write(`正在更新有象零件分析 CLI 到 ${check.target_version}，并刷新 Skill…\n`);
        const version = await installGlobalUpdate(channel, agent);
        emit(json, { ok: true, updated: true, previous_version: CLI_VERSION, version, channel, agent }, `有象零件分析 CLI 已更新：${CLI_VERSION} -> ${version}\n本地成本配置未改动。`);
      } catch (error) {
        throw new CliError(`CLI 更新失败。请手动运行 npm install -g @yoxiang/cli@${channel}，再运行 yoxiang install --agent ${agent}。`, 5, error);
      }
      return;
    }

    const apiBase = takeOption(args, "--api-base") ?? process.env.YOXIANG_API_BASE_URL ?? DEFAULT_API_BASE_URL;
    const resultBase = process.env.YOXIANG_RESULT_BASE_URL ?? DEFAULT_RESULT_BASE_URL;
    const client = new AnalysisClient({ baseUrl: apiBase, resultBaseUrl: resultBase });

    if (command === "doctor") {
      assertNoExtraArgs(args, "yoxiang doctor --help");
      const options = await client.options();
      emit(json, { ok: true, api_base_url: apiBase, service: "reachable", options }, formatDoctor(options, apiBase));
      return;
    }

    if (command !== "analyze") throw new CliError(`未知命令：${command ?? ""}。请运行 yoxiang --help。`, 4);
    const first = args[0];
    if (first === "options") {
      args.shift();
      assertNoExtraArgs(args, "yoxiang analyze options --help");
      const options = await client.options();
      emit(json, { ok: true, options }, formatOptions(options));
      return;
    }
    if (first === "status") {
      args.shift();
      const id = args.shift();
      const wait = takeFlag(args, "--wait");
      if (!id) throw new CliError("status 需要 batch-id。请运行 yoxiang analyze status --help。", 4);
      assertNoExtraArgs(args, "yoxiang analyze status --help");
      let result = await client.batchStatus(id);
      if (wait && !isBatchTerminal(result.status)) {
        result = await client.waitBatch(id, 10 * 60_000, (current) => {
          if (!json) process.stderr.write(`当前状态：${current.status}\n`);
        });
      }
      emitAnalysisResult(json, result);
      return;
    }

    const material = takeOption(args, "--material");
    const processName = takeOption(args, "--process");
    const tolerance = takeOption(args, "--tolerance");
    const surfaceRoughness = takeOption(args, "--surface-roughness");
    const wait = takeFlag(args, "--wait");
    if (args.some((arg) => arg.startsWith("-"))) {
      throw new CliError(`无法识别参数：${args.filter((arg) => arg.startsWith("-")).join(" ")}。请运行 yoxiang analyze --help。`, 4);
    }
    if (args.length === 0) throw new CliError("analyze 需要至少一个明确的 STEP/STP 文件路径。请运行 yoxiang analyze --help。", 4);

    process.stderr.write(`正在校验并提交 ${args.length} 个零件进行制造分析…\n`);
    let result = await client.submitBatch({ filePaths: args, material, process: processName, tolerance, surfaceRoughness });
    if (wait && !isBatchTerminal(result.status)) {
      process.stderr.write(`批次 ${result.batch_id} 已提交，等待 Geometry、DFM、AutoCam 和预览…\n`);
      let previous = "";
      result = await client.waitBatch(result.batch_id, 10 * 60_000, (current) => {
        if (current.status !== previous) {
          process.stderr.write(`当前状态：${current.status}\n`);
          previous = current.status;
        }
      });
    }
    emitAnalysisResult(json, result);
  } catch (error: unknown) {
    const cliError = error instanceof CliError ? error : new CliError("命令执行失败。", 5, error);
    if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: { message: cliError.message, details: cliError.details } })}\n`);
    else process.stderr.write(`错误：${cliError.message}\n`);
    process.exitCode = cliError.exitCode;
  }
}

async function runCostProfile(args: string[], json: boolean): Promise<void> {
  const action = args.shift();
  if (action === "show") {
    assertNoExtraArgs(args, "yoxiang cost-profile show --help");
    const profile = await loadCostProfile();
    emit(json, { ok: true, cost_profile: profile ?? "missing", path: costProfilePath() }, profile ? formatCostProfile(profile) : `本地成本配置尚未创建：${costProfilePath()}`);
    return;
  }
  if (action === "configure") {
    let input: ConfigureCostProfileInput;
    const anyFlag = args.some((value) => value.startsWith("--"));
    if (!anyFlag && process.stdin.isTTY && process.stdout.isTTY && !json) input = await promptCostProfile();
    else {
      input = {
        startupFee: requiredNumber(args, "--startup-fee"),
        programmingFee: requiredNumber(args, "--programming-fee"),
        machineHourRate: requiredNumber(args, "--machine-hour-rate"),
        setupFee: requiredNumber(args, "--setup-fee"),
        material: takeOption(args, "--material") ?? "6061",
        materialPricePerKg: requiredNumber(args, "--price-per-kg"),
        currency: takeOption(args, "--currency") ?? "CNY",
      };
    }
    assertNoExtraArgs(args, "yoxiang cost-profile configure --help");
    const profile = await configureCostProfile(input);
    emit(json, { ok: true, cost_profile: profile, path: costProfilePath() }, formatCostProfile(profile));
    return;
  }
  if (action === "material" && args.shift() === "set") {
    const material = args.shift();
    if (!material) throw new CliError("material set 需要材料代码。", 4);
    const price = requiredNumber(args, "--price-per-kg");
    assertNoExtraArgs(args, "yoxiang cost-profile material set --help");
    const profile = await setMaterialPrice(material, price);
    emit(json, { ok: true, cost_profile: profile, path: costProfilePath() }, `已保存 ${material.toUpperCase()} 材料单价：${profile.currency} ${price}/kg`);
    return;
  }
  if (action === "stock-adjustment" && args.shift() === "set") {
    const mapping = [
      ["--block-allowance-per-side-mm", "block_allowance_per_side_mm"],
      ["--cylinder-radial-allowance-mm", "cylinder_radial_allowance_mm"],
      ["--cylinder-end-allowance-mm", "cylinder_end_allowance_mm"],
      ["--round-up-mm", "round_up_mm"],
    ] as const;
    const adjustment: Partial<CostProfile["stock_adjustment"]> = {};
    for (const [flag, key] of mapping) {
      const value = optionalNumber(args, flag);
      if (value !== undefined) adjustment[key] = value;
    }
    if (Object.keys(adjustment).length === 0) throw new CliError("请至少指定一项毛坯余量或取整粒度。", 4);
    assertNoExtraArgs(args, "yoxiang cost-profile stock-adjustment set --help");
    const profile = await setStockAdjustment(adjustment);
    emit(json, { ok: true, cost_profile: profile, path: costProfilePath() }, formatCostProfile(profile));
    return;
  }
  throw new CliError("未知 cost-profile 子命令。请运行 yoxiang cost-profile --help。", 4);
}

async function ensureInstallCostProfile(json: boolean): Promise<"existing" | "configured" | "missing"> {
  if (await loadCostProfile()) return "existing";
  if (json || !process.stdin.isTTY || !process.stdout.isTTY) return "missing";
  await configureCostProfile(await promptCostProfile());
  return "configured";
}

async function promptCostProfile(): Promise<ConfigureCostProfileInput> {
  process.stdout.write("成本参数只保存在本机，不会上传。有象分析服务不会返回价格。\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return {
      startupFee: await promptNumber(rl, "开机固定费（每款一次，CNY）："),
      programmingFee: await promptNumber(rl, "编程费（每款一次，CNY）："),
      machineHourRate: await promptNumber(rl, "机时费（每小时，可为 0，CNY）："),
      setupFee: await promptNumber(rl, "装夹费（每次，可为 0，CNY）："),
      material: "6061",
      materialPricePerKg: await promptNumber(rl, "6061 材料单价（CNY/kg）："),
      currency: "CNY",
    };
  } finally {
    rl.close();
  }
}

async function promptNumber(rl: ReturnType<typeof createInterface>, prompt: string): Promise<number> {
  const value = Number((await rl.question(prompt)).trim());
  if (!Number.isFinite(value) || value < 0) throw new CliError("费用必须是大于或等于 0 的数字。", 4);
  return value;
}

function emitAnalysisResult(json: boolean, result: AnalysisBatchResult): void {
  emit(json, { ok: result.status === "completed" || result.status === "completed_with_gaps", batch: result }, formatAnalysisResult(result));
  if (result.status === "failed" || result.status === "expired") process.exitCode = 5;
  else if (!isBatchTerminal(result.status)) process.exitCode = 3;
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

function optionalNumber(argv: string[], name: string): number | undefined {
  const raw = takeOption(argv, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new CliError(`${name} 必须是大于或等于 0 的数字。`, 4);
  return value;
}

function requiredNumber(argv: string[], name: string): number {
  const value = optionalNumber(argv, name);
  if (value === undefined) throw new CliError(`${name} 为必填项。`, 4);
  return value;
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

async function installSkill(agent: "codex" | "claude" | "all"): Promise<string[]> {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = join(packageRoot, "skills", "yoxiang-part-analysis");
  const targets: string[] = [];
  if (agent === "codex" || agent === "all") targets.push(join(homedir(), ".codex", "skills", "yoxiang-part-analysis"));
  if (agent === "claude" || agent === "all") targets.push(join(homedir(), ".claude", "skills", "yoxiang-part-analysis"));
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
  return targets;
}

function atomicCapabilities(): string[] {
  return ["零件几何与尺寸", "最小毛坯形状/尺寸/体积/重量", "总工时与分阶段工时", "装夹次数与估算等级", "DFM findings/建议/3D 节点", "3D 预览与缩略图", "本地成本参数管理"];
}

function formatInstall(paths: string[], profile: string, includeCapabilities: boolean): string {
  return [
    `yoxiang-part-analysis Skill 已安装：`,
    ...paths.map((path) => `- ${path}`),
    ...(includeCapabilities ? ["", "可用原子能力：", ...atomicCapabilities().map((item) => `- ${item}`)] : []),
    "",
    profile === "missing" ? `本地成本配置尚未创建：${costProfilePath()}` : `本地成本配置：${profile === "existing" ? "已保留" : "已创建"}`,
  ].join("\n");
}

function formatUpdateCheck(check: { channel: UpdateChannel; current_ahead: boolean; current_version: string; target_version: string; update_available: boolean }): string {
  const status = check.update_available ? "发现可用更新" : check.current_ahead ? "当前版本高于发布渠道" : "当前已是最新版本";
  return [status, `当前版本：${check.current_version}`, `${check.channel} 版本：${check.target_version}`].join("\n");
}

function formatDoctor(options: AnalysisOptions, apiBase: string): string {
  return ["有象零件分析 CLI 状态正常", `API：${apiBase}`, `支持：${options.supported_extensions.join("、")}`, `单文件上限：${options.max_file_bytes.toLocaleString()} bytes（10 MiB）`, "服务端只返回制造分析，不返回价格或交期。"].join("\n");
}

function formatOptions(options: AnalysisOptions): string {
  return ["默认：6061 / cnc-machining / ISO2768-m / Ra3.2", "可用材料：", ...options.materials.map((item) => `- ${item.value}: ${item.label}`), "可用工艺：", ...options.processes.map((item) => `- ${item.value}: ${item.label}`)].join("\n");
}

function formatAnalysisResult(result: AnalysisBatchResult): string {
  const lines = [`结果链接：${result.result_url ?? result.result_path}`, `批次：${result.batch_id}`, `状态：${result.status}`];
  for (const item of result.items) lines.push("", ...formatPart(item));
  return lines.join("\n");
}

function formatPart(item: AnalysisResult): string[] {
  const lines = [`${item.file_name}（${item.status}）`];
  if (item.geometry) {
    lines.push(`- 零件尺寸：${item.geometry.length_mm} × ${item.geometry.width_mm} × ${item.geometry.height_mm} mm`);
    lines.push(`- 实体体积：${item.geometry.volume_cm3} cm³；表面积：${item.geometry.surface_area_cm2} cm²；复杂度：${item.geometry.complexity_level} (${item.geometry.complexity_score})`);
    const stock = item.geometry.minimum_stock;
    if (stock) lines.push(`- 最小毛坯：${stock.shape}，${Object.entries(stock.dimensions_mm).map(([key, value]) => `${key}=${value} mm`).join("，")}；${stock.volume_cm3} cm³ / ${stock.mass_kg} kg`);
  }
  if (item.machining) {
    lines.push(`- 总加工工时：${item.machining.total_processing} 小时；装夹：${item.machining.setup_count ?? "未知"} 次；估算等级：${item.machining.estimate_grade ?? "未知"}`);
    for (const stage of item.machining.stages ?? []) lines.push(`  - ${stageLabel(stage.code)}：${stage.hours} 小时`);
  }
  const findings = publicFindings(item);
  if (findings.length) lines.push("- DFM 风险：", ...findings.map((finding) => `  - ${finding}`));
  for (const [name, component] of Object.entries(item.components)) if (component.status === "failed" || component.status === "unavailable") lines.push(`- ${name}：${component.status}${component.error_code ? ` (${component.error_code})` : ""}`);
  return lines;
}

function publicFindings(item: AnalysisResult): string[] {
  const values = [...(item.dfm?.findings ?? []).map((finding) => finding.message_cn || finding.message_en || finding.code), ...(item.dfm?.warnings ?? []), ...(item.dfm?.suggestions ?? [])].filter(Boolean);
  return [...new Set(values)];
}

function stageLabel(code: string): string {
  return ({ roughing: "粗加工", semi_finishing: "半精加工", finishing: "精加工", holemaking: "孔加工", threading: "螺纹", machine_actions: "机内动作" } as Record<string, string>)[code] ?? code;
}

function formatCostProfile(profile: CostProfile): string {
  return [
    `本地成本配置：${costProfilePath()}`,
    `币种：${profile.currency}`,
    `开机固定费：${profile.startup_fee_per_design}`,
    `编程费：${profile.programming_fee_per_design}`,
    `机时费：${profile.machine_hour_rate}/小时`,
    `装夹费：${profile.setup_fee_per_setup}/次`,
    "材料单价：",
    ...Object.entries(profile.materials).map(([material, value]) => `- ${material}: ${value.price_per_kg}/kg`),
    `毛坯调整：block 单边 ${profile.stock_adjustment.block_allowance_per_side_mm} mm；cylinder 径向 ${profile.stock_adjustment.cylinder_radial_allowance_mm} mm、端面 ${profile.stock_adjustment.cylinder_end_allowance_mm} mm；向上取整 ${profile.stock_adjustment.round_up_mm} mm`,
  ].join("\n");
}
