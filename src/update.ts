import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const NPM_PACKAGE = "@yoxiang/cli";
export const NPM_REGISTRY = "https://registry.npmjs.org";

export type UpdateAgent = "codex" | "claude" | "all";
export type UpdateChannel = "next" | "latest";

export type UpdateCheck = {
  channel: UpdateChannel;
  current_ahead: boolean;
  current_version: string;
  target_version: string;
  update_available: boolean;
};

export async function checkForUpdate(
  currentVersion: string,
  channel: UpdateChannel,
  registry = NPM_REGISTRY,
): Promise<UpdateCheck> {
  const response = await fetch(`${registry.replace(/\/$/, "")}/@yoxiang%2Fcli`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
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
  const updatedCLI = join(globalRootOutput.trim(), "@yoxiang", "cli", "dist", "cli.js");
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
