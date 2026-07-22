# @yoxiang/quote-cli

有象成物公开测试零件报价 CLI 与 Agent Skill。它只处理用户明确指定、单个不超过 10 MiB 的 STEP/STP 文件，并通过公开匿名接口返回批量三档价格、加工时间、DFM 与 3D 结果链接。

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
yoxiang quote ./a.step ./b.step --wait --json
yoxiang help quote
yoxiang update --agent codex
```

完整安装资料：<https://test.yoxiang.cn/open/quote-cli/installation.md>

## 开发

```bash
npm install
npm run verify
```

将唯一源文档同步到前端静态目录：

```bash
npm run export:site-docs -- ../poieza-quote-frontend
```

License: MIT
