# @yoxiang/cli

YoxiangAI 公开零件制造分析 CLI 与 Agent Skill。CLI 以分钟展示 H2 原始刀路总工时、六阶段工时，以及孔加工/粗加工/精加工/倒角去毛刺四类 CNC 工时，并返回几何、几何最小毛坯、实际加工毛坯及解析方向、三/五轴推荐与实际路线、预测装夹与物理规划装夹、DFM 和 3D 结果；仅对实际采用的可执行三轴路线，Agent 才使用本机费率按公开固定公式计算。当前 AS-hybrid v3c 装夹模型是 development-only 最佳候选，CLI 会明确显示未做 validation 认证，不将其描述为 certified。

```bash
npm install -g @yoxiang/cli@latest
yoxiang install --agent codex
yoxiang analyze ./a.step ./b.step --wait --compact-json
yoxiang analyze ./plate.step --stock-box 20 868 175 --wait --compact-json
yoxiang analyze ./round.step --stock-cylinder 60 25 --wait --compact-json
yoxiang analyze status <batch-id> --extract route
yoxiang cost-profile show --json
```

Successful API requests check npm at most once every 24 hours. When a newer CLI exists, human output and structured JSON include an update notice; analysis never auto-installs an update.

完整安装资料：<https://test.yoxiang.cn/open/part-analysis-cli/installation.md>

开发验证：`npm install && npm run verify`。文档同步：`npm run export:site-docs -- ../poieza-quote-frontend`。

License: MIT
