export const CLI_VERSION = "1.0.0";

const shared = `默认分析参数：6061 铝、CNC、ISO 2768-m、Ra 3.2。
限制：每个零件文件不超过 10 MiB；每批最多 5 个零件。
安全：只上传命令中明确列出的文件；不接受目录或 glob，不扫描相邻文件。
返回：几何、零件尺寸、几何最小毛坯、实际加工毛坯及解析方向、H2 原始刀路总工时、六阶段工时、孔加工/粗加工/精加工/倒角去毛刺四类 CNC 工时、推荐/实际路线、机器学习三轴装夹次数及置信度、DFM、3D 预览；不返回平台价格、交期或内部定价信息。
分享：公开结果链接及其中的 3D 访问有效 7 天；这不是上传文件或分析结果的数据保留期限。
更新：成功访问分析服务后最多每 24 小时检查一次 npm；发现新版本时只提示，不自动安装，检查失败不影响分析。

退出码：
  0  已完成（包括 completed_with_gaps）或显示帮助
  3  仍在处理或等待超时
  4  参数、格式、文件大小或已迁移命令错误
  5  网络、服务端或分析失败`;

export const HELP = {
  root: `Aximelo 零件分析 CLI ${CLI_VERSION}

用法：
  aximelo analyze <file.step> [more.stp ...] [--wait] [--compact-json|--json|--extract section]
  aximelo analyze status <batch-id> [--wait] [--compact-json|--json|--extract section]
  aximelo analyze options [--json]
  aximelo cost-profile configure
  aximelo cost-profile show [--json]
  aximelo cost-profile material set <material> --price-per-kg <value>
  aximelo cost-profile stock-adjustment set [options]
  aximelo doctor
  aximelo install --agent codex|claude|all
  aximelo update [--check]

说明：服务端只做制造分析。仅当实际采用路线是可执行三轴时，Agent 才能使用本机 cost-profile 按固定公式计算；五轴或人工报价路线不计算价格，费率不会上传。
旧 aximelo quote 已停用，调用时不发送网络请求并返回退出码 4。

${shared}`,
  analyze: `分析一个或多个明确指定的受支持单零件文件；一个文件也使用单元素批次。原生 CAD 的必要预处理仅用于制造分析，CLI 不提供派生 CAD 文件下载。

用法：
  aximelo analyze <file...> [options]

参数：
  --material <code>           默认 6061
  --process <code>            默认 cnc-machining；cnc 会自动归一化
  --tolerance <code>          默认 ISO2768-m
  --surface-roughness <code>  默认 Ra3.2
  --stock-box <A> <B> <C>    显式方料名义三边；服务端自动匹配 X/Y/Z
  --stock-cylinder <D> <L>   显式圆料直径和长度；与 --stock-box 互斥
  --wait                      等待批次进入最终状态
  --compact-json              面向 Agent 的有界摘要；工时统一为分钟，保留全部零件并标明省略的 DFM 明细
  --extract <section>         独立提取 overview、geometry、stock、machining、route、dfm 或 preview
  --json                      stdout 输出完整 CLI JSON；工时统一为分钟，进度写入 stderr
  --api-base <url>            覆盖分析 API 地址

同一命令中的显式毛坯应用于列出的每个文件；已知毛坯时应明确传入。DFM warning 不阻断工时分析。组件缺失时状态为 completed_with_gaps，并在 geometry/dfm/machining/preview 中单独标明。

${shared}`,
  options: `查询公开材料、工艺、公差、粗糙度、文件限制和制造分析能力。

用法：
  aximelo analyze options [--json] [--api-base <url>]`,
  status: `查询分析批次状态；--wait 会持续轮询到 completed、completed_with_gaps、failed 或 expired。

用法：
  aximelo analyze status <batch-id> [--wait] [--compact-json|--json|--extract section] [--api-base <url>]`,
  costProfile: `管理仅保存在本机的成本参数。POSIX 路径为 \${XDG_CONFIG_HOME:-~/.config}/aximelo/cost-profile.json，Windows 路径为 %APPDATA%\\aximelo\\cost-profile.json。

用法：
  aximelo cost-profile configure [--startup-fee N --programming-fee N --machine-hour-rate N --setup-fee N --material 6061 --price-per-kg N --currency CNY]
  aximelo cost-profile show [--json]
  aximelo cost-profile material set <material> --price-per-kg <value>
  aximelo cost-profile stock-adjustment set [--block-allowance-per-side-mm N] [--cylinder-radial-allowance-mm N] [--cylinder-end-allowance-mm N] [--round-up-mm N]

configure 不带参数时在交互终端依次询问开机固定费、编程费、机时费、装夹费和 6061 材料单价。所有值可为 0；默认币种 CNY。
默认长方体单边余量、圆柱径向余量和圆柱端面余量均为 3 mm；默认取整粒度为 0。配置文件在 POSIX 上以 0600 保存。`,
  doctor: `检查 Aximelo 公开制造分析服务连通性和能力；不读取或上传零件文件。

用法：
  aximelo doctor [--json] [--api-base <url>]`,
  install: `安装 aximelo Skill，并列出全部原子能力。

首次交互安装会询问本地费率。--json 或非交互安装不会等待输入，而是返回 cost_profile: missing；Skill 首次算价时再阻塞询问并保存。

用法：
  aximelo install --agent codex|claude|all [--json]`,
  update: `检查或更新 @aximelo/cli，并刷新 aximelo Skill。不会覆盖已有本地成本配置。

用法：
  aximelo update [--check] [--agent codex|claude|all] [--json]`,
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
  if (tokens[0] === "analyze") {
    if (tokens[1] === "options") return "options";
    if (tokens[1] === "status") return "status";
    return "analyze";
  }
  if (tokens[0] === "cost-profile") return "costProfile";
  if (tokens[0] === "doctor") return "doctor";
  if (tokens[0] === "install") return "install";
  if (tokens[0] === "update") return "update";
  return "root";
}
