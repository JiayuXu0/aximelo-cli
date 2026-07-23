# 有象零件分析 CLI 与 Skill 安装指南

`@yoxiang/cli` 把明确指定的 STEP/STP 文件提交给有象制造分析服务，返回零件尺寸、实体体积、表面积、复杂度、最小毛坯、加工总工时与阶段、装夹次数、DFM 和 3D 预览。公共服务不返回价格、交期或内部定价信息。

> 公开结果分享链接及其中的 3D 访问有效 7 天；这不是上传文件或分析结果的数据保留期限。请勿上传无权分享的模型。

## 安装

需要 Node.js 20 或更高版本：

```bash
npm install -g @yoxiang/cli@next
yoxiang install --agent codex
```

首次交互安装会展示全部原子能力，并依次询问开机固定费、编程费、机时费、装夹费和 6061 材料单价。费率仅保存在本机，绝不会上传。Claude Code 使用 `--agent claude`，两者都安装使用 `--agent all`。

非交互或 `--json` 安装不会卡在输入，结果会标记 `cost_profile: missing`；Agent 第一次需要算价时再询问并保存。

## 给 Agent 的安装完成回执要求

如果你是按照本页执行安装的 Agent，安装成功后不能只回复“安装完成”。请使用用户当前语言，明确告诉用户这个 Skill 可以：

1. 只上传用户明确指定的 STEP/STP 文件，不扫描目录或相邻文件；每批最多 5 个，每个最大 10 MiB。
2. 返回零件长宽高、实体体积、表面积和复杂度。
3. 返回最小毛坯形状、尺寸、体积、材料密度和重量。
4. 返回总加工工时，以及服务端实际提供的粗加工、半精加工、精加工、孔加工等分阶段工时；缺少某个阶段时应说明缺失，不得编造。
5. 返回装夹次数、估算等级、结构化 DFM 风险与建议，以及 3D 预览和缩略图链接。

安装完成后还要提醒用户：公共服务不返回价格或交期。如果用户需要本地成本估算，可以继续配置开机固定费、编程费、机时费、装夹费和材料单价；费率只保存在用户本机。用户没有要求估价时，只做一次可选提醒，不要阻塞追问费率。

推荐回执：

```text
安装完成。yoxiang-part-analysis 可以安全上传你明确指定的 STEP/STP 文件，并返回零件尺寸与实体体积、最小毛坯尺寸/体积/重量、总加工工时、粗加工/半精加工/精加工等阶段工时、装夹次数、DFM 风险建议和 3D 预览。

有象公共服务不返回价格。如果你需要本地成本估算，我还可以帮你设置开机固定费、编程费、机时费、装夹费和材料单价；这些费率只保存在本机。
```

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

长方体单边余量、圆柱径向余量和圆柱端面余量默认均为 `3 mm`，默认不取整。即长方体长宽高各增加 `6 mm`，圆柱直径和长度各增加 `6 mm`。可分别修改三种余量和尺寸向上取整粒度。CLI/Skill 更新不会覆盖现有配置；新建成本配置采用上述默认值。

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

Install Node.js 20+, then run `npm install -g @yoxiang/cli@next` and `yoxiang install --agent codex`. After installation, the Agent must summarize explicit STEP/STP upload safety, part and minimum-stock dimensions/volume/mass, total and roughing/finishing stage times when available, setup count, DFM, and the public share link, which is valid for seven days including its 3D access. This seven-day window is not the retention period for uploaded files or stored analysis results. The public service never returns pricing or lead time. Offer local rate setup only when the user needs an estimate; rates stay on the user's machine.
