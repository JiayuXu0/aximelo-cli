import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const NPM_PACKAGE = "@aximelo/cli";
export const NPM_REGISTRY = "https://registry.npmjs.org";

export type UpdateAgent = "codex" | "claude" | "all";
export type UpdateChannel = "latest";

export type UpdateCheck = {
  channel: UpdateChannel;
  current_ahead: boolean;
  current_version: string;
  target_version: string;
  update_available: boolean;
};

export type UpdateNotice = {
  update_available: true;
  current_version: string;
  latest_version: string;
  command: "aximelo update --agent codex";
};

type UpdateNoticeState = {
  checked_at_ms: number;
  current_version: string;
  latest_version?: string;
  update_available?: boolean;
  check_failed?: boolean;
};

export type UpdateNoticeOptions = {
  cachePath?: string;
  intervalMs?: number;
  failureIntervalMs?: number;
  nowMs?: number;
  registry?: string;
  timeoutMs?: number;
};

export const UPDATE_NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_NOTICE_FAILURE_INTERVAL_MS = 60 * 60 * 1000;
export const UPDATE_NOTICE_TIMEOUT_MS = 1500;

export async function checkForUpdate(
  currentVersion: string,
  channel: UpdateChannel,
  registry = NPM_REGISTRY,
  signal?: AbortSignal,
): Promise<UpdateCheck> {
  const response = await fetch(`${registry.replace(/\/$/, "")}/@aximelo%2Fcli`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal,
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
  const metadata = (await response.json()) as { "dist-tags"?: Record<string, string> };
  const targetVersion = metadata["dist-tags"]?.[channel];
  if (!targetVersion) throw new Error(`npm dist-tag ${channel} is unavailable`);
  const comparison = compareVersions(targetVersion, currentVersion);
  return {
    channel,
    current_ahead: comparison < 0,
    current_version: currentVersion,
    target_version: targetVersion,
    update_available: comparison > 0,
  };
}

export function updateNoticePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "aximelo", "update-check.json");
}

export async function checkForUpdateNotice(
  currentVersion: string,
  options: UpdateNoticeOptions = {},
): Promise<UpdateNotice | undefined> {
  const cachePath = options.cachePath ?? updateNoticePath();
  const nowMs = options.nowMs ?? Date.now();
  const intervalMs = options.intervalMs ?? UPDATE_NOTICE_INTERVAL_MS;
  const failureIntervalMs = options.failureIntervalMs ?? UPDATE_NOTICE_FAILURE_INTERVAL_MS;
  const cached = await readUpdateNoticeState(cachePath);
  if (cached?.current_version === currentVersion) {
    const ageMs = Math.max(0, nowMs - cached.checked_at_ms);
    const freshnessMs = cached.check_failed ? failureIntervalMs : intervalMs;
    if (ageMs < freshnessMs) return noticeFromState(cached);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? UPDATE_NOTICE_TIMEOUT_MS);
  try {
    const check = await checkForUpdate(currentVersion, "latest", options.registry ?? NPM_REGISTRY, controller.signal);
    const state: UpdateNoticeState = {
      checked_at_ms: nowMs,
      current_version: currentVersion,
      latest_version: check.target_version,
      update_available: check.update_available,
    };
    await writeUpdateNoticeState(cachePath, state).catch(() => undefined);
    return noticeFromState(state);
  } catch {
    if (cached?.current_version === currentVersion && cached.update_available) return noticeFromState(cached);
    await writeUpdateNoticeState(cachePath, {
      checked_at_ms: nowMs,
      current_version: currentVersion,
      check_failed: true,
    }).catch(() => undefined);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function installGlobalUpdate(
  channel: UpdateChannel,
  agent: UpdateAgent,
  registry = NPM_REGISTRY,
): Promise<string> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await execFileAsync(
    npm,
    ["install", "--global", `${NPM_PACKAGE}@${channel}`, `--registry=${registry}`],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const { stdout: globalRootOutput } = await execFileAsync(npm, ["root", "--global"], {
    maxBuffer: 1024 * 1024,
  });
  const updatedCLI = join(globalRootOutput.trim(), "@aximelo", "cli", "dist", "cli.js");
  const { stdout: versionOutput } = await execFileAsync(process.execPath, [updatedCLI, "--version"], {
    maxBuffer: 1024 * 1024,
  });
  await execFileAsync(process.execPath, [updatedCLI, "install", "--agent", agent, "--json"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return versionOutput.trim();
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = leftVersion.core[index] - rightVersion.core[index];
    if (comparison !== 0) return Math.sign(comparison);
  }
  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0;
  if (leftVersion.prerelease.length === 0) return 1;
  if (rightVersion.prerelease.length === 0) return -1;
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = numericIdentifier(leftPart);
    const rightNumber = numericIdentifier(rightPart);
    if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function noticeFromState(state: UpdateNoticeState): UpdateNotice | undefined {
  if (!state.update_available || !state.latest_version) return undefined;
  return {
    update_available: true,
    current_version: state.current_version,
    latest_version: state.latest_version,
    command: "aximelo update --agent codex",
  };
}

async function readUpdateNoticeState(path: string): Promise<UpdateNoticeState | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<UpdateNoticeState>;
    if (typeof value.checked_at_ms !== "number" || typeof value.current_version !== "string") return undefined;
    return value as UpdateNoticeState;
  } catch {
    return undefined;
  }
}

async function writeUpdateNoticeState(path: string, state: UpdateNoticeState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  if (process.platform !== "win32") await chmod(path, 0o600);
}

function parseVersion(value: string): { core: [number, number, number]; prerelease: string[] } {
  const match = value
    .trim()
    .replace(/^v/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) throw new Error(`invalid semantic version: ${value}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function numericIdentifier(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}
