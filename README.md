# @yoxiang/cli

YoxiangAI 公开零件制造分析、原生 CAD 转 STEP CLI 与 Agent Skill。STEP/STP 直接分析；Parasolid、ACIS、SolidWorks、NX/Creo、Inventor、CATIA 单零件由 HOOPS Exchange 自动转换为私有 STEP 后继续分析。CLI 以分钟展示 H2 原始刀路总工时、六阶段工时，以及孔加工/粗加工/精加工/倒角去毛刺四类 CNC 工时，并返回几何、毛坯、三/五轴路线、机器学习装夹次数及置信度、DFM 和 3D 结果；公共服务不返回商业价格或交期。

```bash
npm install -g @yoxiang/cli@latest
yoxiang install --agent codex
yoxiang analyze ./a.step ./b.step --wait --compact-json
yoxiang analyze ./native.x_t --wait --compact-json
yoxiang convert ./native.x_t ./baseline.step --output-dir ./step-out --json
yoxiang analyze ./plate.step --stock-box 20 868 175 --wait --compact-json
yoxiang analyze ./round.step --stock-cylinder 60 25 --wait --compact-json
yoxiang analyze status <batch-id> --extract route
yoxiang cost-profile show --json
```

Successful API requests check npm at most once every 24 hours. When a newer CLI exists, human output and structured JSON include an update notice; analysis never auto-installs an update.

完整安装资料：<https://test.yoxiang.cn/open/part-analysis-cli/installation.md>

开发验证：`npm install && npm run verify`。文档同步：`npm run export:site-docs -- ../poieza-quote-frontend`。

License: MIT
