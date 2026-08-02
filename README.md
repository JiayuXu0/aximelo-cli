# @yoxiang/cli

YoxiangAI 公开零件制造分析 CLI 与 Agent Skill。CLI 接受明确指定的 STEP/STP 和受支持原生单零件作为分析输入，以分钟展示 H2 原始刀路总工时、六阶段工时，以及孔加工/粗加工/精加工/倒角去毛刺四类 CNC 工时，并返回几何、毛坯、三/五轴路线、机器学习装夹次数及置信度、DFM 和 3D 结果。原生 CAD 的必要预处理仅用于内部制造分析，公共 CLI 不提供格式转换或派生 CAD 文件下载；公共服务不返回商业价格或交期。

```bash
npm install -g @yoxiang/cli@latest
yoxiang install --agent codex
yoxiang analyze ./a.step ./b.step --wait --compact-json
yoxiang analyze ./native.x_t --wait --compact-json
yoxiang analyze ./plate.step --stock-box 20 868 175 --wait --compact-json
yoxiang analyze ./round.step --stock-cylinder 60 25 --wait --compact-json
yoxiang analyze status <batch-id> --extract route
yoxiang cost-profile show --json
```

Successful API requests check npm at most once every 24 hours. When a newer CLI exists, human output and structured JSON include an update notice; analysis never auto-installs an update.

完整安装资料：<https://test.yoxiang.cn/open/part-analysis-cli/installation.md>

开发验证：`npm install && npm run verify`。文档同步：`npm run export:site-docs -- ../poieza-quote-frontend`。

License: MIT
