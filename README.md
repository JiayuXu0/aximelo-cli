# @yoxiang/quote-cli

有象成物公开测试零件报价 CLI 与 Agent Skill。它只处理用户明确指定的单个 STEP/STP 文件，并通过公开匿名接口返回三档价格与 DFM 建议。

```bash
npm install -g @yoxiang/quote-cli@next
yoxiang install --agent codex
yoxiang quote options
yoxiang quote submit ./part.step --material AL6061 --process cnc-machining --quantity 10 --wait
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
