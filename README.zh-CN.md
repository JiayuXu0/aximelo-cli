<p align="center">
  <a href="https://www.aximelo.ai/zh-cn/">
    <img src="https://raw.githubusercontent.com/JiayuXu0/aximelo-cli/main/docs/assets/aximelo-wordmark.png" alt="Aximelo" width="360">
  </a>
</p>

<h1 align="center">Aximelo CLI 与 Agent Skill</h1>

<p align="center">
  给 AI Agent 的制造分析能力。<br>
  把明确选中的 CAD 零件交给 Agent，直接用自然语言了解几何、毛坯、加工路线、装夹、H2 刀路工时、DFM 和 3D 结果。
</p>

<p align="center">
  <a href="https://github.com/JiayuXu0/aximelo-cli/blob/main/README.md">English</a> ·
  <a href="https://github.com/JiayuXu0/aximelo-cli/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aximelo/cli"><img src="https://img.shields.io/npm/v/%40aximelo%2Fcli?color=ff3800" alt="npm 版本"></a>
  <a href="https://www.npmjs.com/package/@aximelo/cli"><img src="https://img.shields.io/node/v/%40aximelo%2Fcli" alt="Node.js 版本"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/%40aximelo%2Fcli" alt="MIT 许可证"></a>
</p>

<p align="center">
  <a href="https://www.aximelo.ai/zh-cn/">官网</a> ·
  <a href="https://www.aximelo.ai/zh-cn/agent-install/">安装说明</a> ·
  <a href="https://www.aximelo.ai/open/aximelo-cli/installation.md">Agent 可读安装契约</a> ·
  <a href="https://www.npmjs.com/package/@aximelo/cli">npm</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/JiayuXu0/aximelo-cli/main/docs/assets/aximelo-hero.webp" alt="带有刀路、装夹方向和制造分析标注的机加工 CAD 零件" width="100%">
</p>

## 用自然语言问 Agent，不用先学命令

Aximelo 通过公开 CLI 分发，但正常使用入口是你的 Agent。只需在 Codex 或 Claude Code 中安装一次 Skill，选中受支持的单零件 CAD 文件，然后直接描述你想知道的制造问题。

```text
分析 /absolute/path/bracket.step。这个零件能不能加工？建议三轴还是五轴？
实际需要几次装夹？H2 加工工时是多少？有哪些 DFM 风险需要重点处理？
```

Skill 会给 Agent 一套明确规则：只读取你指定的文件，只调用一次分析，保留各组件的真实状态，并把结构化结果整理成通俗的制造说明，而不是丢给你一堆 CLI 参数或 JSON。

## 一分钟完成安装

需要 Node.js 20 或更高版本。

### 把这句话交给 Agent

```text
请按照 https://www.aximelo.ai/open/aximelo-cli/installation.md 安装 Aximelo
```

安装契约会告诉 Agent 如何完成安装、检查连接并说明怎么开始第一次分析，不需要你手工输入命令。

### 也可以手工安装

安装到 Codex：

```bash
npm install -g @aximelo/cli@latest
aximelo install --agent codex --json
aximelo doctor --json
```

安装到 Claude Code 时，把 `codex` 改成 `claude`。只有明确需要同时安装到两者时才使用 `--agent all`。`doctor` 只检查服务连通性和当前能力，不会读取或上传零件。

## Aximelo 能帮你回答什么

| 制造问题 | 返回的依据 | 详细说明 |
| --- | --- | --- |
| 这是一个什么零件？ | 明确标注的全局 X/Y/Z 包围盒、车间长×宽×厚、实体体积、表面积、复杂度和源文件格式 | [图纸尺寸与相关信息](https://www.aximelo.ai/zh-cn/drawing-dimensions/) |
| 应该选什么毛坯？ | 几何最小毛坯，以及单独展示的实际加工毛坯来源、局部坐标、车间长×宽×厚、体积、重量和包络检查 | [报价前置分析](https://www.aximelo.ai/zh-cn/quote-precheck/) |
| 应该走三轴还是五轴？ | 加工类别、推荐路线、实际采用路线、时间口径、刀路是否可执行和人工复核原因 | [路线与刀具可达性](https://www.aximelo.ai/zh-cn/toolpath-generation/) |
| 实际需要几次装夹？ | 实际采用路线为可执行三轴时的装夹次数、置信度和验证状态 | [装夹次数判断](https://www.aximelo.ai/zh-cn/setup-count/) |
| 加工需要多长时间？ | H2 原始刀路总工时、实际返回的规划阶段，以及孔加工、粗加工、精加工和去毛刺分类 | [加工时间](https://www.aximelo.ai/zh-cn/machining-time/) |
| 哪些地方不好加工？ | 结构化 DFM 严重程度、位置、原因、建议和关联的 3D 节点 | [DFM 检查](https://www.aximelo.ai/zh-cn/dfm/) |
| 能不能直观看结果？ | 3D 预览和缩略图状态，以及可用时返回的公开结果链接 | [分享分析结果](https://www.aximelo.ai/zh-cn/drawing-sharing/) |
| 能不能估算本地成本？ | 只对实际采用的可执行三轴路线，使用本机保存的费率做透明估算 | [成本前置检查](https://www.aximelo.ai/zh-cn/quote-precheck/) |

H2 总工时、规划阶段工时和四类 CNC 工时是同一份加工时间的不同视图，不能相互重复相加。

## 一份典型的 Agent 回答

> 以下数值是演示数据。真实回答来自你选中的模型，并会保留缺失或未完整组件的状态。

**零件：** `bracket.step`

- **几何：** 包围盒 120 × 80 × 36 mm；实体体积 184.2 cm³；中等复杂度。
- **加工路线：** 实际采用可执行三轴铣削；预测需要 2 次装夹，同时显示置信度和验证状态。
- **H2 工时：** 原始刀路总工时 42.6 分钟。粗加工、精加工、孔加工和去毛刺是这个总工时的分类视图，不是额外工时。
- **DFM：** 深腔刀具可达性和小径深孔需要在投产前复核；每个问题都说明位置和后续处理建议。
- **结果状态：** 即使 DFM 或 3D 预览存在缺口，已经完成的几何和工时结果也会继续保留，不会被包装成“全部成功”。

这才是 Agent 应该给你的答案：有制造结论、有数据依据、有边界，也告诉你下一步需要确认什么，而不是原样输出机器数据。

## 直接使用 CLI

Agent 正常分析应使用有界输出：

```bash
aximelo analyze "/absolute/path/part.step" --wait --compact-json
```

一次最多分析 5 个明确指定的文件：

```bash
aximelo analyze "/absolute/path/a.step" "/absolute/path/b.x_t" --wait --compact-json
```

已知真实毛坯时应明确传入，不能偷偷改成几何最小毛坯：

```bash
aximelo analyze "/absolute/path/block.step" --stock-box 20 868 175 --wait --compact-json
aximelo analyze "/absolute/path/round.step" --stock-cylinder 60 25 --wait --compact-json
```

从已有批次读取某一部分，不需要重新上传：

```bash
aximelo analyze status <batch-id> --extract route
aximelo analyze status <batch-id> --extract dfm
```

三种输出模式互斥：

- `--compact-json`：给 Agent 的有界摘要，正常使用时推荐。
- `--extract overview|geometry|stock|machining|route|dfm|preview`：提取批次中每个零件的同一类结果。
- `--json`：完整 CLI 数据，只用于明确的调试或集成需求。

## 支持的文件与安全边界

当前支持以下单零件 CAD 文件：

```text
.step  .stp  .x_t  .x_b  .sat  .sldprt  .prt  .ipt  .catpart
```

- 每个文件最大 10 MiB；每批最多 5 个文件。
- 只接受明确指定的精确路径，不扫描目录、通配符或相邻文件。
- 拒绝 `.sldasm`、`.asm`、`.iam`、`.catproduct`、`.3dxml`、`.stl`、`.obj` 等装配体和网格文件。
- 原生 CAD 的必要预处理只用于内部制造分析；公共 CLI 不提供独立格式转换或派生 CAD 文件下载。
- 公开结果链接及其中的 3D 访问有效 7 天。不要上传你无权分享的模型。

## 本地成本配置

公共服务不返回平台价格和交期。只有用户明确要求本地估算，并且实际采用路线是有完整依据的可执行三轴路线时，Aximelo 才能使用本机费率计算。

```bash
aximelo cost-profile configure
aximelo cost-profile show --json
```

开机费、编程费、机时费、装夹费和材料单价只保存在用户机器上的 `aximelo/cost-profile.json`，不会上传。五轴路线或需要人工报价的路线不会得到一个猜出来的价格。

## 更新与排查

```bash
aximelo update --agent codex --json
aximelo doctor --json
aximelo --help
```

成功请求分析服务后，Aximelo 最多每 24 小时检查一次 npm 新版本。发现更新时只提示，不会在没有用户授权的情况下自动安装。

## 相关资料

- [Aximelo 中文官网](https://www.aximelo.ai/zh-cn/)
- [给用户看的安装说明](https://www.aximelo.ai/zh-cn/agent-install/)
- [给 Agent 读取的标准安装契约](https://www.aximelo.ai/open/aximelo-cli/installation.md)
- [npm 软件包](https://www.npmjs.com/package/@aximelo/cli)
- [公开结果页面](https://app.aximelo.ai)

## 开发与验证

```bash
npm install
npm run verify
npm pack --dry-run
```

把标准安装说明、Skill 和 manifest 导出到官网仓库：

```bash
npm run export:site-docs -- ../AximeloSkillWeb
```

## 许可证

[MIT](./LICENSE)
