# 有象零件报价 CLI 与 Skill 安装指南

有象报价 CLI 可把你明确指定的一个或多个 STEP/STP 零件组成一个批次，返回经济、标准、加急三档价格、加工时间、几何摘要、公开 DFM 建议及可旋转查看的 3D 结果链接。当前测试能力无需登录，不收集联系方式，也不能下单。

> 文件与结果默认保留 7 天。请勿上传无权分享的模型。

## 环境与默认值

- Node.js 20 或更高版本，支持 macOS、Linux、Windows
- 每个 `.step` / `.stp` 文件最大 10 MiB（10,485,760 bytes）
- 默认：6061 铝、CNC、数量 1、标准表面处理、ISO 2768-m、Ra 3.2
- 每个 IP 每小时最多 10 个零件，同时最多处理 2 个零件

## 安装

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
```

Claude Code 使用 `yoxiang install --agent claude`，两者都安装使用 `--agent all`。安装后可以验证：

```bash
yoxiang --version
yoxiang doctor
```

## 更新 CLI 与 Skill

更新测试渠道的 CLI，并同时刷新 Codex Skill：

```bash
yoxiang update --agent codex
```

只检查是否有新版本，不执行安装：

```bash
yoxiang update --check --json
```

Claude Code 使用 `--agent claude`，两者一起刷新使用 `--agent all`。正式稳定版发布后可以使用 `--channel latest`；当前测试版默认使用 `next`。旧版 CLI 如果还没有 `update` 命令，执行一次兼容更新：

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
```

正常报价不会自动检查更新，避免增加一次网络请求和 Agent 迭代。

如果暂时不能全局安装，可使用：

```bash
npx --yes @yoxiang/quote-cli@next --help
npx --yes @yoxiang/quote-cli@next install --agent codex
```

Skill 原文：<https://test.yoxiang.cn/open/quote-cli/skills/yoxiang-part-quote/SKILL.md>

## 一条命令报价

默认规格无需查询 options，也无需逐项确认：

```bash
yoxiang quote "./part.step" --wait
yoxiang quote "./left.step" "./right.stp" --wait --json
```

只在明确需要时覆盖参数：

```bash
yoxiang quote "./part.step" --material 7075 --quantity 5 --wait
```

CLI 会先校验整批路径、扩展名和大小；任一文件不合法时整批不上传。它不接受目录、glob，也不会扫描相邻文件。最多并行上传两个文件。

Agent 推荐使用 `--json`：stdout 只输出一个最终 JSON，进度写入 stderr。输出包含一个 7 天结果链接，可集中查看各零件报价、加工阶段时间、DFM、WebP 缩略图和 HOOPS 3D 模型；预览失败不影响价格结果。

## Help

```bash
yoxiang --help
yoxiang help quote
yoxiang help quote options
yoxiang help quote status
yoxiang quote --help
yoxiang quote options --help
yoxiang quote status --help
yoxiang doctor --help
yoxiang install --help
yoxiang update --help
```

Help 不访问网络、不读取模型、不执行安装。退出码：`0` 成功/帮助，`2` 无法自动报价，`3` 处理中/超时，`4` 参数或文件错误，`5` 网络、服务端或分析失败。

## 直接交给 Agent

> 请按照 https://test.yoxiang.cn/open/quote-cli/installation.md 安装有象零件报价 CLI 和 Skill，然后用默认 6061 铝、CNC、1 件帮我给这些 STEP 零件报价。

Agent 正常流程只应调用一次 `yoxiang quote ... --wait --json`。只有文件路径不明确、文件超限/格式不支持，或不同零件需要不同参数时，才会合并询问一次。

## 测试能力限制

- 测试 API：`https://quote-test-api.yoxiang.cn`
- 上传地址有效 15 分钟，结果保留 7 天
- `no_auto_quote` 表示暂不能自动报价，不代表进入人工评估
- 结果不公开算法、成本拆分、内部规则或存储地址

---

# Yoxiang Part Quote CLI and Skill

Install Node.js 20+, then run:

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
yoxiang quote "./a.step" "./b.step" --wait --json
```

Defaults are 6061 aluminum, CNC, quantity 1, standard finish, ISO 2768-m, and Ra 3.2. Each explicitly named STEP/STP file must be at most 10 MiB. The CLI validates the complete batch before any upload and returns three price tiers, machining time, public DFM, and a seven-day 3D result link.
