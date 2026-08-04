# Aximelo 制造分析 Skill 安装说明

Aximelo 是安装在 Codex、Claude Code 等 Agent 里的制造分析 Skill。安装后，用户只需要选中一个 CAD 单零件文件并用自然语言提问，Agent 会调用 Aximelo，整理零件几何、毛坯、加工路线、装夹、H2 工时、DFM 和 3D 预览。

> 如果你是收到本页地址的 Agent：请直接完成下面的安装和检查，不要让用户手工输入命令。安装完成后，用用户当前语言说明已经装好、能做什么，以及如何开始第一次分析。

## 一分钟安装

要求：Node.js 20 或更高版本。

在 Codex 中安装：

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent codex --json
aximelo doctor --json
```

在 Claude Code 中安装：

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent claude --json
aximelo doctor --json
```

只有用户明确要求同时安装到两者时，才使用：

```bash
aximelo install --agent all --json
```

`doctor` 只检查 Aximelo 服务和当前能力，不读取或上传零件文件。安装成功后，不要为了演示而搜索用户目录，也不要擅自挑选文件上传。

## 安装完成后怎么使用

用户不需要记命令。让用户明确选中一个或多个零件文件，然后直接提问，例如：

- “分析这个零件，告诉我能不能加工、建议三轴还是五轴、需要几次装夹。”
- “这个零件有哪些 DFM 风险？请按严重程度说明位置、原因和修改建议。”
- “给我看尺寸、实体体积、最小毛坯和实际加工毛坯。”
- “H2 总工时是多少？把粗加工、精加工、孔加工和倒角去毛刺分开说明。”
- “我知道方料是 20 × 868 × 175 mm，请按这个毛坯重新分析。”
- “按数量 20 件计算本地成本；缺少费率时一次问完我需要提供的参数。”

Agent 正常分析时使用有界摘要，避免完整 JSON 占满上下文：

```bash
aximelo analyze "/absolute/path/part.step" --wait --compact-json
```

一次可以分析最多 5 个用户明确指定的文件：

```bash
aximelo analyze "/absolute/path/a.step" "/absolute/path/b.x_t" --wait --compact-json
```

已知方料或圆料时，应显式传入，不要用最小毛坯替代用户给出的真实毛坯：

```bash
aximelo analyze "/absolute/path/part.step" --stock-box 20 868 175 --wait --compact-json
aximelo analyze "/absolute/path/round.step" --stock-cylinder 60 25 --wait --compact-json
```

同一条命令里的毛坯参数会应用到该命令列出的所有文件。不同零件使用不同毛坯时，应分开分析。

## 当前支持的文件

支持以下单零件 CAD 文件：

```text
.step  .stp  .x_t  .x_b  .sat  .sldprt  .prt  .ipt  .catpart
```

- 每个文件最大 10 MiB；每批最多 5 个文件。
- 只上传用户明确指定的精确路径；不接受目录或 glob，不扫描相邻文件。
- 拒绝装配体和网格，包括 `.sldasm`、`.asm`、`.iam`、`.catproduct`、`.3dxml`、`.stl` 和 `.obj`。
- 原生 CAD 的必要预处理只用于内部制造分析。公共 Skill 不提供独立格式转换，也不下载派生 CAD 文件。
- 不要上传用户无权分享的模型。公开结果链接及其中的 3D 访问有效 7 天；这不代表上传文件或分析结果的数据保留期限。

## Aximelo 会返回什么

### 1. 几何与毛坯

- 零件全局 X/Y/Z 包围盒，以及独立的车间长×宽×厚；
- 实体体积、表面积、复杂度；
- 几何最小毛坯的形状、尺寸、体积、密度和重量；
- 实际加工毛坯的来源（用户指定、通用余量或薄板自动推导）、用户输入顺序、毛坯局部 X/Y/Z、车间长×宽×厚、坐标系、体积、重量和包络检查。旧结果没有方向信息时只显示“解析三边（方向未提供）”。

最小毛坯和实际加工毛坯是两件事，回答时必须分开说明。

### 2. 加工路线与装夹

- `machining.route_recommendation` 只给一个最终建议：`three_axis`、`mill_turn` 或 `five_axis`；
- 不再同时输出推荐路线、实际采用路线、候选路线、时间口径或人工报价原因；
- 内部已选中可执行三轴时，只用顶层 `machining.setup_count` 返回一份机器学习装夹次数，并附置信度和模型验证状态。

`mill_turn`、`five_axis` 或没有有效三轴装夹次数时，不得编造装夹次数或价格。

### 3. H2 加工工时

- H2 原始刀路总工时；
- 服务实际返回的阶段工时（规划最多六阶段）；
- 孔加工、粗加工、精加工、倒角去毛刺四类 CNC 工时。

四类 CNC 工时是同一总工时的分类视图，不是额外工时。不要把它们再与 H2 总工时或阶段工时相加。缺少某个阶段或分类时，应明确说“未返回”，不能补造数据。

### 4. DFM 与 3D

- 结构化 DFM 风险等级、位置、说明和建议；
- 与风险关联的 3D 节点；
- 3D 预览和缩略图状态及链接。

DFM warning 不会自动阻断工时分析，但回答时应醒目标出。

## 怎么读取部分成功结果

一个批次可能返回 `completed_with_gaps`。这表示部分组件已经成功，不等于完整成功。Agent 必须分别保留：

- `geometry`
- `dfm`
- `machining`
- `preview`

每个组件自己的状态和错误码。不要因为 3D 成功就声称工时也成功，也不要因为 DFM 缺失而隐藏已经完成的几何结果。

如果用户只想继续查看某一部分，可在现有批次上提取，不要重新上传：

```bash
aximelo analyze status <batch-id> --extract overview
aximelo analyze status <batch-id> --extract geometry
aximelo analyze status <batch-id> --extract stock
aximelo analyze status <batch-id> --extract machining
aximelo analyze status <batch-id> --extract route
aximelo analyze status <batch-id> --extract dfm
aximelo analyze status <batch-id> --extract preview
```

`--extract`、`--compact-json` 和 `--json` 互斥，不能同时使用。

## 本地成本估算

Aximelo 公共服务不返回平台价格或交期。本地成本估算只在以下条件全部满足时使用：

1. `machining.route_recommendation == three_axis`；
2. 有有效的正整数 `machining.setup_count`；
3. 用户明确要求估价，并提供本地费率。

费率只保存在用户机器上的 `aximelo/cost-profile.json`，不会上传。缺少配置且用户要求估价时，应一次询问：开机固定费、编程费、机时费、每次装夹费和材料单价，再保存：

```bash
aximelo cost-profile configure
aximelo cost-profile show --json
```

计算公式：

```text
总价 = 开机固定费 + 编程费
     + 数量 × (
         H2 总工时 ÷ 60 × 机时费
         + 装夹次数 × 每次装夹费
         + 调整后毛坯重量 × 材料单价
       )
```

开机费和编程费每款零件只收一次；机时、装夹和材料随数量增加。中间值不舍入，最终金额按币种保留两位小数。`mill_turn`、`five_axis` 或缺少有效数据时，只说明为什么不能本地估价，不要猜价格。

## 安装完成后应怎样回复用户

安装 Agent 不应只回复“安装完成”。建议回复：

```text
Aximelo 制造分析 Skill 已安装并通过连通性检查。

你现在可以选中一个 STEP/STP 或受支持的原生 CAD 单零件文件，直接问我它能不能加工、尺寸和毛坯是多少、建议三轴、车铣还是五轴、需要几次装夹、H2 工时和 DFM 风险如何。我只会读取你明确指定的文件，不会扫描目录或相邻文件。

公共分析不返回平台价格。如果建议为三轴且有有效装夹次数，并且你需要本地成本估算，我可以再帮你配置开机费、编程费、机时费、装夹费和材料单价；这些费率只保存在本机。
```

用户没有要求估价时，不要阻塞安装去追问费率。

## 更新与排查

更新 CLI 并刷新 Skill：

```bash
aximelo update --agent codex --json
```

Claude Code 使用 `--agent claude`。更新不会覆盖已有本地成本配置。

安装或连接失败时依次检查：

```bash
node --version
npm view @aximelo/cli version
aximelo doctor --json
aximelo --help
```

默认制造分析服务为 `https://api.aximelo.ai`，结果页面为 `https://app.aximelo.ai`，npm 包为 `@aximelo/cli`，Skill 名称为 `aximelo`。

---

## English quick install

Requires Node.js 20 or later:

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent codex --json
aximelo doctor --json
```

Use `--agent claude` for Claude Code and `--agent all` only when both targets are explicitly requested. After installation, analyze only explicitly selected supported single-part CAD files. Never scan directories or adjacent files. Aximelo returns geometry, minimum and actual stock, H2 raw toolpath time, one `three_axis`/`mill_turn`/`five_axis` recommendation, applicable three-axis setup prediction, DFM and 3D preview. Public analysis returns no platform price or lead time; local rates stay on the user's machine and may be used only when the recommendation is `three_axis` and a valid setup count is present.
