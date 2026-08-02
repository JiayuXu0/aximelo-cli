import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(process.argv[2] ?? join(repositoryRoot, "..", "poieza-quote-frontend"));
const outputRoot = join(frontendRoot, "apps", "web", "public", "open", "aximelo-cli");
const installationSource = join(repositoryRoot, "docs", "installation.md");
const skillSource = join(repositoryRoot, "skills", "aximelo", "SKILL.md");
const installationTarget = join(outputRoot, "installation.md");
const skillTarget = join(outputRoot, "skills", "aximelo", "SKILL.md");

await mkdir(dirname(skillTarget), { recursive: true });
await cp(installationSource, installationTarget);
await cp(skillSource, skillTarget);

const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const sourceCommit = getSourceCommit(repositoryRoot);
const manifest = {
  cli: {
    package: packageJson.name,
    version: packageJson.version,
    dist_tag: "latest",
  },
  source: {
    repository: "https://github.com/JiayuXu0/aximelo-cli",
    commit: sourceCommit,
  },
  files: {
    "installation.md": { sha256: await sha256(installationTarget) },
    "skills/aximelo/SKILL.md": { sha256: await sha256(skillTarget) },
  },
};
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Exported part analysis CLI docs to ${outputRoot}\n`);

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function getSourceCommit(cwd) {
  if (process.env.AXIMELO_CLI_SOURCE_COMMIT) return process.env.AXIMELO_CLI_SOURCE_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "uncommitted";
  }
}
