# 有象零件报价 CLI 与 Skill 安装指南

有象报价 CLI 可以将你明确指定的单个 STEP/STP 零件提交给公开测试报价服务，返回经济、标准、加急三个价格档位和可公开的 DFM 建议。当前无需登录，不收集联系方式，也不能下单。

> 测试能力：报价结果仅用于评估，文件与结果默认保留 7 天。不要上传你无权分享的模型。

## 环境要求

- Node.js 20 或更高版本
- macOS、Linux 或 Windows
- 单个 `.step` 或 `.stp` 文件，最大 200 MB

## 安装 CLI

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang doctor
```

如果暂时无法从 npm 安装，可以直接使用公开源码：

```bash
npx --yes github:JiayuXu0/yoxiang-quote-cli doctor
```

## 安装 Agent Skill

Codex：

```bash
yoxiang install --agent codex
```

Claude Code：

```bash
yoxiang install --agent claude
```

也可以让 Agent 直接读取 Skill 原文：

`https://test.yoxiang.cn/open/quote-cli/skills/yoxiang-part-quote/SKILL.md`

## 报价

先查询当前材料和工艺代码：

```bash
yoxiang quote options
```

提交并等待报价：

```bash
yoxiang quote submit ./part.step \
  --material AL6061 \
  --process cnc-machining \
  --quantity 10 \
  --wait
```

查询已有任务：

```bash
yoxiang quote status <quote-id> --wait
```

Agent 调用推荐添加 `--json`，CLI 会在标准输出中只返回一个 JSON 对象，进度信息只写入标准错误。

## 直接交给 Agent

复制下面这句话，并附上你要报价的 STEP 文件：

> 请按照 https://test.yoxiang.cn/open/quote-cli/installation.md 安装有象零件报价 CLI 和 Skill，然后帮我给这个 STEP 零件报价。

Agent 必须向你确认材料、工艺和数量，不能自行猜测；只允许上传你明确指定的文件，不能扫描目录寻找其他模型。

## 当前限制

- 测试 API：`https://quote-test-api.yoxiang.cn`
- 仅支持单文件 STEP/STP
- 上传地址有效 15 分钟
- 文件与结果默认保留 7 天
- 每个 IP 每小时最多创建 10 个任务，同时最多处理 2 个任务
- `no_auto_quote` 表示当前模型无法自动报价，不代表文件上传失败
- 结果不包含算法、成本拆分或内部报价规则

---

# Yoxiang Part Quote CLI and Skill

The public test CLI submits one explicitly selected STEP/STP part and returns economy, standard, and expedited price options plus public DFM suggestions. No account or contact details are required, and ordering is not supported.

Install Node.js 20+, then run:

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
yoxiang doctor
yoxiang quote options
```

Submit a quote with:

```bash
yoxiang quote submit ./part.step --material AL6061 --process cnc-machining --quantity 10 --wait
```

The Agent must ask for missing material, process, or quantity. It may upload only the file you explicitly identify and must not scan nearby directories.
