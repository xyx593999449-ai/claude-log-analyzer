# HITL 回归详情子页面重构设计（DDL 语义对齐版）

## 1. 任务目标

针对当前 `/hitl-iterations/:batchId/regressions/:regressionType` 页面“展示内容与实际数据不匹配”的问题，基于样例数据与三张回归表 DDL/字段注释，重构页面信息架构、字段口径与交互流程，确保页面表达与数据库事实一致。

本设计重点覆盖：

1. 页面展示口径与 DDL 字段语义对齐
2. 回归详情页从“猜字段”改为“强契约渲染”
3. 核实/质检双视角在同一骨架下可读、可比、可追溯

---

## 2. 现状问题（基于样例与代码核对）

## 2.1 字段契约断层

后端已返回结构化字段（`rows[].sampleId/primaryOldValue/primaryNewValue/diffDirection`），但前端详情页模型仍在兼容旧结构并“猜字段”（如 `id/compare_verify_result/new_verify_result`），导致：

- 行标识、旧值、新值经常解析为空，页面出现大量 `-`
- 差异方向未直接使用后端 `diffDirection`，出现“待判断”泛滥

## 2.2 汇总数字与明细语义混用

- `positive_count/negative_count` 在 DDL 注释中是“正样本/负样本”，不是“变好/变差样本”
- 页面中“变好/变差/稳定计数”应来自 `rows.diffDirection`，而不是样本类型计数

## 2.3 多运行结果缺少显式切换

样例中同一 `batch_id=batch_0415` 存在多条回归运行（不同 `dataset_name/updatetime/timestamp_suffix`）。当前详情页默认取最新运行，但缺少“运行上下文切换器”，用户容易误读“为什么列表和我预期不是同一批样本”。

## 2.4 样本详情过度原始化

- `verify_info`、`evidence_record` 是大 JSON，当前默认大片 raw 输出，可读性差
- 缺少“结构化摘要 + 原始 JSON 折叠”的分层

---

## 3. DDL 驱动的字段语义基线

## 3.1 `poi_verified_regression_test_result`（运行级汇总）

- `total_count`：总样本数量
- `positive_count`：正样本数量
- `negative_count`：负样本数量
- `verify_worsen_ratio/verify_better_ratio`：核实逆向率/提升率
- `qc_worsen_ratio/qc_better_ratio`：质检逆向率/提升率

结论：该表只负责“回归运行摘要”，不承载样本差异行。

## 3.2 `poi_verified_regression_test_compare`（样本级差异）

- `compare_verify_result/new_verify_result`：核实旧结果 -> 新结果
- `compare_qc_status/new_qc_status`：质检旧状态 -> 新状态
- `is_consistent`：与真值一致性（是/否）
- `sample_type`：样本类型（正样本/负样本）
- `compare_name/address/...`：字段差异文本（常见 `old->new`）

结论：该表是详情页主表数据源。

## 3.3 `poi_verified_regression_test`（样本补充上下文）

- `verify_info`：核实结构化说明
- `evidence_record`：证据集合
- `true_* / verified_* / cur_*`：真值、核实后、当前结果

结论：该表用于右侧详情，不用于主表排序与计数。

---

## 4. 页面重构方案

## 4.1 信息架构（新）

1. 页首上下文区
2. 运行摘要区
3. 差异列表区（主）
4. 样本详情区（侧）

## 4.2 页首上下文区

展示：

- `batchId`
- 视角（核实回归 / 质检回归）
- 运行选择器（`datasetName + runAt`）
- 返回 HITL 列表

交互：

- 切换运行后，刷新摘要、列表与右侧详情（重置选中行为：默认首条）

## 4.3 运行摘要区（严格区分两类指标）

- 指标组 A（回归指标）：逆向率、提升率
- 指标组 B（样本构成）：总样本、正样本、负样本
- 指标组 C（明细统计）：变差数、变好数、稳定数、待判断数

规则：

- A/B 来自 `summary`
- C 来自 `rows.diffDirection` 的实时统计

## 4.4 差异列表区（核心重构）

列定义（统一骨架）：

1. `任务/样本`：`taskId + sampleId + sampleType`
2. `旧结果`：`primaryOldValue`
3. `新结果`：`primaryNewValue`
4. `副维度变化`：`secondaryDiffText`（为空显示 `-`）
5. `差异方向`：`diffDirection`
6. `一致性`：`isConsistent`
7. `查看详情`

排序建议：

- 默认：`worsen > better > unknown > same`
- 支持筛选：`全部/变差/变好/稳定/待判断`

关键点：页面直接消费后端 `rows`，不再前端二次猜测 old/new。

## 4.5 样本详情区（右侧）

分为 4 块：

1. `结果差异`
2. `字段变化`（名称/地址/类型/城市/状态）
3. `核实上下文`（`verify_info` 结构化摘要）
4. `证据摘要`（`evidence_record` 结构化摘要）

展示策略：

- 默认展示结构化摘要
- `查看原始 JSON` 折叠展开
- 避免默认输出整段原始对象

---

## 5. 前后端契约收敛（必须执行）

## 5.1 前端仅使用强类型 DTO

详情页仅消费：

- `HitlRegressionDetailResponse`
- `HitlRegressionSampleDetail`

禁止在页面模型层做“多命名兼容猜字段”。

## 5.2 差异方向来源统一

- 以后端 `rows[].diffDirection` 为唯一真值
- 前端不再用 `isConsistent` 或 old/new 自行推断方向

## 5.3 运行定位参数

详情页接口查询参数固定：

- `batchId`（路径）
- `regressionType`（路径）
- `datasetName`（query，可选）
- `runAt`（query，可选）

样本详情补充：

- `taskId`（query，可选但建议透传，避免同 `sampleId` 歧义）

---

## 6. 交互与状态设计

## 6.1 空态

- 无运行：`当前批次暂无回归运行结果`
- 有运行无明细：`当前运行暂无差异样本`
- 无样本详情：`未找到对应样本详情`

## 6.2 错误态

- 接口失败展示“可重试”按钮
- 保留当前筛选与运行上下文

## 6.3 文案边界

页面文案仅表达业务事实，不出现“待后端返回/待补充/默认展示”等研发过程描述。

---

## 7. 实施分期建议

1. `P0 契约修正`：前端详情页改用强类型字段，移除猜字段模型
2. `P0 运行切换`：新增运行选择器，打通 `datasetName/runAt`
3. `P1 详情结构化`：样本详情改为结构化摘要 + raw 折叠
4. `P1 交互增强`：方向筛选、字段变化高亮、异常提示

---

## 8. 验收清单

1. 样例 `batch_0415` 下能显式切换两条运行（数据集1/数据集2）
2. 切换视角（核实/质检）后，旧值新值不再大面积 `-`
3. `positive/negative` 与“变好/变差”口径不再混淆
4. 差异方向与后端 `diffDirection` 一致
5. 样本详情默认可读，不再默认全量 raw JSON

