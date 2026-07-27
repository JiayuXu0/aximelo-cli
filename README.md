# @yoxiang/cli

YoxiangAI 公开零件制造分析 CLI 与 Agent Skill。服务端返回几何、最小毛坯、H2 原始刀路工时、三/五轴推荐与实际路线、三轴装夹、DFM 和 3D 结果；仅对实际采用的可执行三轴路线，Agent 才使用本机费率按公开固定公式计算。

```bash
npm install -g @yoxiang/cli@latest
yoxiang install --agent codex
yoxiang analyze ./a.step ./b.step --wait --json
yoxiang cost-profile show --json
```

完整安装资料：<https://test.yoxiang.cn/open/part-analysis-cli/installation.md>

开发验证：`npm install && npm run verify`。文档同步：`npm run export:site-docs -- ../poieza-quote-frontend`。

License: MIT
