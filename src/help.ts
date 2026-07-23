export const CLI_VERSION = "0.3.0-next.0";

const shared = `默认参数：6061 铝、CNC、数量 1、标准表面处理、ISO 2768-m、Ra 3.2。
限制：每个 STEP/STP 文件不超过 10 MiB（10,485,760 bytes）。
并发：每个批次最多 5 个零件；当前不限制每天报价次数。
安全：只上传命令中明确列出的文件路径；不接受目录、glob，也不会扫描相邻文件。
返回：经济/标准/加急三档价格、AutoCam 总工时与阶段、装夹次数、几何摘要、DFM，以及保留 7 天的 3D 结果链接。
判定：任一 DFM warning 或 AutoCam 工时不可用时返回 no_auto_quote，不回退旧价格。

退出码：
  0  成功或显示帮助
  2  无法自动报价
  3  仍在处理或等待超时
  4  参数、格式或文件大小错误
  5  网络、服务端或分析失败`;

export const HELP = {
  root: `有象零件报价 CLI ${CLI_VERSION}

用法：
  yoxiang quote <file.step> [more.stp ...] [options]
  yoxiang quote options [--json]
  yoxiang quote status <batch-id> [--wait] [--json]
  yoxiang doctor
  yoxiang install --agent codex|claude|all
  yoxiang update [--check] [--channel next|latest] [--agent codex|claude|all]

示例：
  yoxiang quote "./part.step" --wait
  yoxiang quote "./a.step" "./b.step" --wait --json
  yoxiang update --check
  yoxiang help quote

全局参数：
  --api-base <url>  覆盖报价 API 地址
  --json            stdout 只输出一个最终 JSON；进度写入 stderr
  --version         显示版本
  -h, --help        显示对应层级帮助

${shared}`,
  quote: `提交一个或多个明确指定的 STEP/STP 文件，形成一个报价批次。

用法：
  yoxiang quote <file...> [options]
  yoxiang quote submit <file...> [options]   # 兼容旧语法

示例：
  yoxiang quote "./part.step" --wait
  yoxiang quote "./left.step" "./right.stp" --quantity 2 --wait --json

参数：
  --material <code>           默认 6061
  --process <code>            默认 cnc；接受 cnc 或 cnc-machining
  --quantity <n>              默认 1
  --surface-finish <code>     默认 standard
  --tolerance <code>          默认 ISO2768-m
  --surface-roughness <code>  默认 Ra3.2
  --wait                      等待批次进入最终状态
  --json                      stdout 只输出一个最终 JSON
  --api-base <url>            覆盖报价 API 地址

CLI 会先校验整批文件，再发起网络请求，并最多并行上传 5 个文件。超过 5 个时请分批顺序提交。

${shared}`,
  options: `查询当前公开材料、工艺、表面处理、公差、粗糙度和能力标记。

用法：
  yoxiang quote options [--json] [--api-base <url>]

示例：
  yoxiang quote options
  yoxiang quote options --json

默认参数无需先查询 options；仅在用户明确要求非默认规格且代码不确定时使用。`,
  status: `查询批次状态；--wait 会持续轮询直到完成或超时。

用法：
  yoxiang quote status <batch-id> [--wait] [--json] [--api-base <url>]

示例：
  yoxiang quote status "<batch-id>"
  yoxiang quote status "<batch-id>" --wait --json

退出码 3 表示仍在处理或等待超时；结果链接保留 7 天。`,
  doctor: `检查公开报价服务连通性和当前能力，不读取或上传任何 STEP 文件。

用法：
  yoxiang doctor [--json] [--api-base <url>]

示例：
  yoxiang doctor

doctor 只建议在安装完成后验证，或连接失败时排障。`,
  install: `安装 yoxiang-part-quote Skill。显示帮助时不会写入文件。

用法：
  yoxiang install --agent codex|claude|all

示例：
  yoxiang install --agent codex
  yoxiang install --agent all`,
  update: `检查或更新有象报价 CLI，并刷新对应 Agent 的 yoxiang-part-quote Skill。

用法：
  yoxiang update [--check] [--channel next|latest] [--agent codex|claude|all] [--json]

示例：
  yoxiang update --check
  yoxiang update --agent codex
  yoxiang update --channel latest --agent all --json

参数：
  --check             只检查版本，不安装或写入文件
  --channel <tag>     更新渠道，默认 next；稳定版使用 latest
  --agent <agent>     更新后刷新的 Skill，默认 codex
  --json              stdout 只输出一个最终 JSON；进度写入 stderr

update 不读取或上传 STEP/STP 文件，也不访问报价 API。`,
} as const;

export type HelpTopic = keyof typeof HELP;

export function resolveHelp(argv: string[]): HelpTopic | undefined {
  if (argv.length === 0) return "root";
  if (argv[0] === "help") return topicFromTokens(argv.slice(1));
  const helpIndex = argv.findIndex((arg) => arg === "--help" || arg === "-h");
  if (helpIndex < 0) return undefined;
  return topicFromTokens(argv.slice(0, helpIndex));
}

function topicFromTokens(tokens: string[]): HelpTopic {
  if (tokens[0] === "quote") {
    if (tokens[1] === "options") return "options";
    if (tokens[1] === "status") return "status";
    return "quote";
  }
  if (tokens[0] === "doctor") return "doctor";
  if (tokens[0] === "install") return "install";
  if (tokens[0] === "update") return "update";
  return "root";
}
