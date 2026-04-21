# HITL 负样本主表切换方案

> 补充口径（2026-04-21）：正式环境已进一步收敛为只读取 `public.t_poi_key_property_check_result_ext`。`public.v_hitl_negative_samples`、`public.iteration_negative_samples`、`public.iteration_negative_samples_0415_bak` 均视为开发过程遗留对象，不再作为正式环境依赖或读取回退链路。

## 1. 背景

当前 `HITL` 页面相关后端实现，默认将人工反馈结果池主表解析为 `iteration_negative_samples`（PostgreSQL 侧也兼容 `iteration_negative_samples_0415_bak`）。

现在数据库计划将这部分数据切换到：

- `public.t_poi_key_property_check_result_ext_0416`

这不是一次简单的“表名替换”，而是一次“主表规格切换”：

- 新表保留了大量人工标注字段，可复用现有问题识别逻辑
- 但多个旧代码直接依赖的字段在新表中发生了改名、语义变化或缺失
- 如果直接把表名改掉，`HITL` 列表、详情页和问题下钻会出现空数据或字段映射错误

本文档用于给出基于当前代码现状的可执行切换方案。

---

## 2. 当前代码依赖现状

### 2.1 PostgreSQL 仓储当前只识别旧表

`server/repository.pg.ts` 当前 `negative` 表候选仅包含：

- `public.iteration_negative_samples`
- `iteration_negative_samples`
- `public.iteration_negative_samples_0415_bak`
- `iteration_negative_samples_0415_bak`

代码位置：

- `server/repository.pg.ts:726-731`

这意味着即使新表已经存在，仓储层当前也不会自动切到新表。

### 2.2 HITL 列表页依赖旧表的批次和时间字段

`getHitlIterations()` 当前直接使用：

- `batch_id`
- `updatetime`
- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`

代码位置：

- `server/repository.pg.ts:1743-1767`

其中最关键的是：

- `batchId` 直接取 `n.batch_id`
- `startedAt` 直接取 `MIN(updatetime)`

### 2.3 HITL 详情页和问题下钻依赖旧表展示字段

问题列表接口与问题详情接口目前直接读取：

- `name`
- `address`
- `city`
- `poi_type`
- `quality_status`
- `qc_time`
- `verified_addr`
- `verified_city_adcode`

代码位置：

- 问题列表：`server/repository.pg.ts:2097-2122`
- 问题详情：`server/repository.pg.ts:2133-2203`

因此，只要新表里这些列名不一致，页面就会出现字段空值。

---

## 3. 表结构对比

## 3.1 旧表：`iteration_negative_samples_0415_bak`

DDL 来源：

- `example/hitl/ddl/public.iteration_negative_samples.txt`

旧表核心字段可以按三类理解：

### 3.1.1 页面主索引字段

- `task_id`
- `id`
- `batch_id`
- `name`
- `address`
- `city`
- `poi_type`
- `qc_time`
- `updatetime`

### 3.1.2 数字员工原始结论字段

- `verify_result`
- `quality_status`
- `qc_status`
- `qc_score`
- `qc_result`
- `verify_info`
- `evidence_record`

### 3.1.3 人工标注字段

- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_url`
- `manual_added_evidence_type`
- `manual_added_evidence_abstract`
- `verified_name`
- `verified_addr`
- `verified_poi_type`
- `verified_city_adcode`

## 3.2 新表：`t_poi_key_property_check_result_ext_0416`

DDL 来源：

- `example/hitl/ddl/public.t_poi_key_property_check_result_ext_0416.txt`

本轮按以下前提收敛方案：

- 新表已补齐 `batch_id` 字段
- 新表已补齐 `verify_info` 字段

新表明显更接近“作业结果扩展事实表”，包含：

### 3.2.1 任务与主数据字段

- `id`
- `guid`
- `task_id`
- `main_task_id`
- `package_id`
- `name_chn`
- `addr_chn`
- `city`
- `poi_type`
- `adcode`
- `x_coord`
- `y_coord`
- `poi_status`
- `old_*`
- `verified_*`

### 3.2.2 数字员工原始结论字段

- `verify_result`
- `verify_info`
- `qc_status`
- `qc_result`
- `evidence_record`

### 3.2.3 人工标注字段

- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_url`
- `manual_added_evidence_type`
- `manual_added_evidence_abstract`

## 3.3 关键差异表

| 旧表字段 | 新表字段 | 结论 |
|---|---|---|
| `batch_id` | `batch_id` | 可直接复用 |
| `name` | `name_chn` | 需改名映射 |
| `address` | `addr_chn` | 需改名映射 |
| `city_adcode` | `adcode` 或 `old_city_adcode` / `verified_city_adcode` | 需按场景区分 |
| `quality_status` | 无同名字段 | 本轮确认映射到 `qc_status` |
| `qc_time` | 无同名字段 | 前端不再展示 |
| `updatetime` | 无同名字段，候选为 `create_time` | 本轮确认映射到 `create_time` |
| `verify_info` | `verify_info` | 新表补齐后可直接复用 |
| `verified_addr` | `verified_address` | 需改名映射 |
| `verified_city_adcode` | `verified_city_adcode` | 可直接复用 |
| `poi_status` | `poi_status` | 可直接复用 |
| 人工标注相关字段 | 同名存在 | 这部分最适合直接复用 |

### 3.4 本次切换真正的风险点

本次切换最大的风险已经从“字段不存在”收敛为“映射口径要不要一次定清”。当前真正需要明确的是：

1. `updatetime` 改用 `create_time` 是否被全链路接受
2. `quality_status` 改用 `qc_status` 是否视为产品口径调整
3. `qc_score / has_risk / is_qualified / is_manual_required` 是否统一按 `qc_result` 派生

也就是说：

- “问题识别逻辑”大概率还能复用
- “批次聚合中的时间口径”和“详情页字段映射”必须重写一层兼容映射

---

## 4. 推荐切换策略

推荐采用：

- `兼容视图/CTE 归一化`
- `仓储层显式支持新表`
- `分阶段灰度切换`

不建议直接全局把 `iteration_negative_samples` 替换为新表名。

## 4.1 第一阶段：沿用新表中的 `batch_id`

由于新表已补齐 `batch_id` 字段，本轮可以直接沿用当前页面主批次口径：

- `HITL` 页面一级主键继续使用 `batch_id`
- `overlay`、`modification`、`regression_*` 三类表继续通过 `batch_id` 与主页面关联

这意味着：

- 列表页 `GROUP BY batch_id` 的主体逻辑可以保留
- 批次详情和问题下钻的 `WHERE batch_id = ?` 查询条件可以保留
- 这次切换不再需要额外的批次换算层

## 4.2 第二阶段：新增“负样本归一化视图”

最稳妥的落地方式不是直接改每一个查询，而是在 PostgreSQL 侧先做一层归一化视图，例如：

- `public.v_hitl_negative_samples`

该视图把新表重命名成旧代码能消费的字段集合，例如：

- `batch_id`
- `name`
- `address`
- `city`
- `poi_type`
- `verify_result`
- `quality_status`
- `qc_status`
- `qc_score`
- `qc_result`
- `updatetime`
- `qc_time`
- `verify_info`
- `evidence_record`
- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_url`
- `manual_added_evidence_type`
- `manual_added_evidence_abstract`
- `verified_name`
- `verified_addr`
- `verified_poi_type`
- `verified_city_adcode`

### 4.2.1 最终归一化规格

根据当前已确认的产品口径，`t_poi_key_property_check_result_ext_0416` 需要补齐并稳定输出以下字段集合：

- 主键与索引字段：
  - `id`
  - `task_id`
  - `batch_id`
- 原始 POI 展示字段：
  - `name_chn`
  - `addr_chn`
  - `city`
  - `poi_type`
  - `adcode`
- 核实结果字段：
  - `verify_result`
  - `verify_info`
  - `evidence_record`
- QC 原始字段：
  - `qc_status`
  - `qc_result`
- 人工标注字段：
  - `verify_content_is_correct`
  - `verify_action_is_correct`
  - `qc_intercept_is_correct`
  - `evidence_status`
  - `issue_observation_tags`
  - `judgment_dimension_tags`
  - `manual_comment`
  - `conflicting_evidence`
  - `manual_added_evidence_url`
  - `manual_added_evidence_type`
  - `manual_added_evidence_abstract`
- 人工修正后字段：
  - `verified_name`
  - `verified_address`
  - `verified_poi_type`
  - `verified_city_adcode`
- 时间字段：
  - `create_time`

在兼容视图或 CTE 归一化层，对外继续暴露旧 `iteration_negative_samples` 风格字段。

### 4.2.2 最终映射逻辑

推荐的最终映射如下：

| 归一化字段 | 最终来源 | 说明 |
|---|---|---|
| `task_id` | `task_id` | 直接复用 |
| `id` | `id` | 直接复用 |
| `batch_id` | `batch_id` | 直接复用 |
| `name` | `name_chn` | 直接改名 |
| `address` | `addr_chn` | 直接改名 |
| `city` | `city` | 直接复用 |
| `poi_type` | `poi_type` | 直接复用 |
| `verify_result` | `verify_result` | 直接复用 |
| `verify_info` | `verify_info` | 新表补齐后直接复用 |
| `evidence_record` | `evidence_record::text` | 统一文本化输出 |
| `quality_status` | `qc_status` | 本轮确认以 `qc_status` 代替 |
| `qc_status` | `qc_status` | 直接复用 |
| `qc_score` | `qc_result->>'qc_score'` | 从 `qc_result` 派生 |
| `qc_result` | `qc_result::text` | 保留完整明细 |
| `has_risk` | `qc_result->>'has_risk'` | 从 `qc_result` 派生 |
| `is_qualified` | `qc_result->'statistics_flags'->>'is_qualified'` | 从 `qc_result.statistics_flags` 派生 |
| `is_manual_required` | `qc_result->'statistics_flags'->>'is_manual_required'` | 从 `qc_result.statistics_flags` 派生 |
| `updatetime` | `create_time::text` | 本轮确认使用 `create_time` |
| `qc_time` | `NULL` | 前端不再展示 |
| `verify_content_is_correct` | `verify_content_is_correct` | 直接复用 |
| `verify_action_is_correct` | `verify_action_is_correct` | 直接复用 |
| `qc_intercept_is_correct` | `qc_intercept_is_correct` | 直接复用 |
| `evidence_status` | `evidence_status` | 直接复用 |
| `issue_observation_tags` | `issue_observation_tags` | 直接复用 |
| `judgment_dimension_tags` | `judgment_dimension_tags` | 直接复用 |
| `manual_comment` | `manual_comment` | 直接复用 |
| `conflicting_evidence` | `conflicting_evidence` | 直接复用 |
| `manual_added_evidence_url` | `manual_added_evidence_url` | 直接复用 |
| `manual_added_evidence_type` | `manual_added_evidence_type` | 直接复用 |
| `manual_added_evidence_abstract` | `manual_added_evidence_abstract` | 直接复用 |
| `verified_name` | `verified_name` | 直接复用 |
| `verified_addr` | `verified_address` | 直接改名 |
| `verified_poi_type` | `verified_poi_type` | 直接复用 |
| `verified_city_adcode` | `verified_city_adcode` | 直接复用 |

### 4.2.3 `qc_result` 的补充派生能力

基于样例数据实际灌入 mock SQLite 后的验证，`qc_result` 除了可以派生旧字段，还可以稳定提供更细的展示信息：

- `qc_result.explanation`
  - 可作为“QC 结果摘要”主文案
- `qc_result.risk_dims`
  - 可作为风险维度标签
- `qc_result.dimension_results.name.status / explanation`
- `qc_result.dimension_results.address.status / explanation`
- `qc_result.dimension_results.category.status / explanation`
- `qc_result.dimension_results.location.status / explanation`
- `qc_result.dimension_results.administrative.status / explanation`
- `qc_result.triggered_rules`
  - 可作为规则命中列表

这部分不是切表阻塞项，但建议作为问题详情页的后续增强展示来源。

### 4.2.2 为什么优先推荐视图

因为现有代码里围绕负样本表的查询点不少：

- 批次列表聚合
- 批次详情拉全量样本
- 问题任务列表
- 问题任务详情
- issueCount 统计逻辑

如果直接在应用层四处散改映射：

- 容易遗漏字段
- 容易出现 SQLite / PG 逻辑分叉
- 后续再换表时又要重来一遍

而引入视图后：

- 可以先保持接口契约稳定
- 把风险集中到一个地方
- 业务确认口径时，只要调整视图而不必大改代码

## 4.3 第三阶段：代码改成“优先视图，再回退旧表”

仓储层建议把 `negative` 表候选顺序改为：

1. `public.v_hitl_negative_samples`
2. `v_hitl_negative_samples`
3. `public.t_poi_key_property_check_result_ext_0416`
4. `t_poi_key_property_check_result_ext_0416`
5. `public.iteration_negative_samples`
6. `iteration_negative_samples`
7. `public.iteration_negative_samples_0415_bak`
8. `iteration_negative_samples_0415_bak`

这样可以分两步灰度：

- 先上线视图，不动业务代码
- 再改仓储候选顺序切过去

如果新表还在补数，也可以一键回退到旧表。

## 4.4 第四阶段：补齐字段兜底逻辑

由于新表无法完全一比一覆盖旧表，仓储层还应同步加几处兜底：

### 4.4.1 `startedAt`

当前默认取批次最早 `updatetime`。

切换后建议统一为：

- `MIN(create_time)`

原因是本轮已经明确：

- `updatetime` 由 `create_time` 映射
- `qc_time` 前端不再展示，也不再作为主时间口径

### 4.4.2 `qualityStatus`

新表没有 `quality_status`。

本轮明确：

- 统一由 `qc_status` 映射到 `qualityStatus`

因此这已经不是缺字段问题，而是产品展示口径调整。

### 4.4.3 `verifyInfo`

新表补齐 `verify_info` 后，详情页可继续直接输出结构化核实信息，不再需要回退 `extra_info`。

### 4.4.4 `qcScore / hasRisk / isQualified / isManualRequired`

这四个字段不再要求新表额外补顶层列。

建议统一按 `qc_result` 派生：

- `qcScore <- qc_result.qc_score`
- `hasRisk <- qc_result.has_risk`
- `isQualified <- qc_result.statistics_flags.is_qualified`
- `isManualRequired <- qc_result.statistics_flags.is_manual_required`

这样可以减少新表重复列，同时保证 SQLite mock 与 PostgreSQL 正式环境读取逻辑一致。

---

## 5. 推荐实施步骤

## 5.1 数据侧

1. 确认 `t_poi_key_property_check_result_ext_0416` 已补齐 `batch_id`
2. 确认 `t_poi_key_property_check_result_ext_0416` 已补齐 `verify_info`
3. 产出归一化视图 `v_hitl_negative_samples`
4. 用一个真实批次验证视图是否能串上 `overlay / modification / regression_*`

## 5.2 Mock 侧

为了让本地 SQLite mock 与正式环境保持同一套字段口径，建议在 mock 初始化时增加旧表到新表的同步灌数逻辑：

1. 以 `iteration_negative_samples` 为源表
2. 在 SQLite 中构建 mock 版 `t_poi_key_property_check_result_ext_0416`
3. 旧表 `verify_info` 原样搬运到新表 `verify_info`
4. `name -> name_chn`
5. `address -> addr_chn`
6. `verified_addr -> verified_address`
7. `updatetime -> create_time`
8. `qc_score / has_risk / is_qualified / is_manual_required` 回灌进 `qc_result`

这样做的目标是：

- 前后端联调统一只认新表口径
- SQLite / PostgreSQL 不会长期分叉
- 后续正式切表时无需再改第二遍前端 contract

## 5.3 后端

1. 更新 `server/repository.pg.ts` 的 `negative` 表候选顺序
2. 在负样本视图或仓储映射层补齐最终字段映射
3. 对 `qc_score / has_risk / is_qualified / is_manual_required` 统一走 `qc_result` 派生
3. 保持接口响应结构不变，避免前端联动改动扩大

## 5.4 联调验证

至少覆盖以下检查项：

1. `GET /api/hitl/iterations` 能正常返回批次列表
2. 列表中的 `batchId / sampleCount / startedAt / issueCount` 不为空且数量合理
3. `GET /api/hitl/iterations/:batchId` 能正常展示反馈池样本数
4. 问题列表页的 `name / address / city / poiType / verifyResult / manualComment` 能正确展示
5. 问题详情页的人工标注结果、补充证据、核实后字段能正确展示
6. 问题详情页的 `verifyInfo / qcScore / hasRisk / isQualified` 显示正确
7. 同一 `batchId` 仍能串起 `overlay / modification / regression` 三块数据

---

## 6. 最终建议

本次切换推荐采用：

- `先建归一化视图，再切仓储候选`

而不是：

- `直接把代码里的表名从 iteration_negative_samples 改成 t_poi_key_property_check_result_ext_0416`

原因很明确：

1. 新表不是旧表同构替换，仍存在明显字段改名与派生字段
2. 当前代码对 `batch_id / updatetime / name / address / quality_status / verified_addr` 有直接依赖，因此仍需一层兼容归一化
3. 归一化视图能把风险集中在数据库层，避免前后端一起改
4. 可以保留回退能力，更适合这类联调中切换

如果必须给一个一句话方案：

- 在新表已补齐 `batch_id` 与 `verify_info` 的前提下，先把 `t_poi_key_property_check_result_ext_0416` 适配成旧 `iteration_negative_samples` 的兼容视图，并统一约定 `quality_status <- qc_status`、`updatetime <- create_time`、`qc_score / has_risk / is_qualified / is_manual_required <- qc_result`，再让仓储层优先读这个视图，是当前最稳、最省回归成本的切法。
