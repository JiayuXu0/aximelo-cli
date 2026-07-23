# 有象零件分析 CLI 与 Skill 安装指南

`@yoxiang/cli` 把明确指定的 STEP/STP 文件提交给有象制造分析服务，返回零件尺寸、实体体积、表面积、复杂度、最小毛坯、加工总工时与阶段、装夹次数、DFM 和 3D 预览。公共服务不返回价格、交期或内部定价信息。

> 文件、分析结果和 3D 链接默认保留 7 天。请勿上传无权分享的模型。

## 安装

需要 Node.js 20 或更高版本：

```bash
npm install -g @yoxiang/cli@next
yoxiang install --agent codex
```

首次交互安装会展示全部原子能力，并依次询问开机固定费、编程费、机时费、装夹费和 6061 材料单价。费率仅保存在本机，绝不会上传。Claude Code 使用 `--agent claude`，两者都安装使用 `--agent all`。

非交互或 `--json` 安装不会卡在输入，结果会标记 `cost_profile: missing`；Agent 第一次需要算价时再询问并保存。

## 原子能力

- `yoxiang analyze <files...> --wait --json`：一次分析一个批次
- `yoxiang analyze status <batch-id>`：查询或继续等待
- `yoxiang analyze options`：查询材料、工艺和限制
- `yoxiang cost-profile configure`：配置固定费率和首个材料
- `yoxiang cost-profile show --json`：读取本地配置
- `yoxiang cost-profile material set ...`：补充材料单价
- `yoxiang cost-profile stock-adjustment set ...`：设置采购余量和规格取整
- `yoxiang doctor/install/update`：诊断、安装和更新

每个文件最大 10 MiB，每批最多 5 个。CLI 只上传命令明确列出的路径，不接受目录或 glob，也不扫描相邻文件。

## 制造分析

```bash
yoxiang analyze "./part.step" --wait
yoxiang analyze "./left.step" "./right.stp" --wait --json
yoxiang analyze "./part.step" --material 7075 --wait --json
```

默认值是 6061、`cnc-machining`、ISO 2768-m、Ra 3.2。DFM warning 会醒目标记，但不阻断工时分析。某个组件失败时，批次可返回 `completed_with_gaps`，并分别给出 geometry/dfm/machining/preview 状态和错误码。

旧 `yoxiang quote` 已停用，不访问网络，固定返回迁移提示和退出码 `4`。

## 本地成本配置

POSIX 保存于 `${XDG_CONFIG_HOME:-~/.config}/yoxiang/cost-profile.json`，权限 `0600`；Windows 保存于 `%APPDATA%\\yoxiang\\cost-profile.json`。

```bash
yoxiang cost-profile configure
yoxiang cost-profile show --json
yoxiang cost-profile material set 7075 --price-per-kg 36
yoxiang cost-profile stock-adjustment set --block-allowance-per-side-mm 2 --round-up-mm 5
```

毛坯余量默认都是 `0`，不取整。可分别配置长方体单边余量、圆柱径向余量、圆柱端面余量和尺寸向上取整粒度。CLI/Skill 更新不会覆盖现有配置。

Agent 使用固定公式直接计算，不调用本地或服务端报价引擎：

```text
总价 = 开机固定费 + 编程费
     + 数量 × (总工时 × 机时费 + 装夹次数 × 装夹费 + 调整后毛坯重量 × 材料单价)
```

开机费和编程费每款零件只收一次；机时、装夹和材料随数量增长。中间值不舍入，最终金额按币种保留两位小数。非零费用项缺少对应分析数据时不得编造总价。

## 更新与帮助

```bash
yoxiang update --agent codex
yoxiang update --check --json
yoxiang --help
yoxiang analyze --help
yoxiang cost-profile --help
yoxiang doctor --help
```

更新会刷新 `yoxiang-part-analysis` Skill，不会读取或覆盖本地成本配置，也不会读取 STEP 文件。测试 API 默认为 `https://quote-test-api.yoxiang.cn`。

---

# Yoxiang Part Analysis CLI and Skill

Install Node.js 20+, then run `npm install -g @yoxiang/cli@next` and `yoxiang install --agent codex`. The public service returns manufacturing geometry, minimum stock, machining stages, setup count, DFM, and seven-day 3D links—never pricing or lead time. Rates stay in the local cost profile; the Agent calculates estimates with the documented formula.
