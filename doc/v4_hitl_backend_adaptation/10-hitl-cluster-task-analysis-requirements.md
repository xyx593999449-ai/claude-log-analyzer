# 需求文档：HITL 问题簇分析、候选执行结果与任务级详情分析

## 1. 背景

当前 `HITL` 页面的问题分析、迭代建议、候选展示与问题详情页，仍主要基于旧版 `overlay_draft` JSON 结构进行解析：

- `issue_distribution`
- `learnable_patterns`
- `skill_impact`

但上游已将以下两张表的 `jsonb` 规格升级为新结构：

- `public.iteration_overlay_drafts`
- `public.iteration_skill_modifications`

同时新增：

- `public.task_analysis_results`

用于承接“人工标注结果日志解析后的任务级详情分析”。

这意味着当前 `HITL` 页面需要完成一次正式规格切换：

1. 批次级问题分析从旧聚合字段切换到 `clusters` 结构
2. 候选版本从旧 `changes.summary / modified_files` 切换到新 `description / modifications / error`
3. 问题详情页接入 `task_analysis_results.analysis_comment` 作为任务级分析正文

---

## 2. 本轮目标

本轮目标是把 `HITL` 页面从“旧结构兼容展示”升级为“新结构正式消费”，形成以下闭环：

1. 批次级问题分析：基于 `overlay_draft.clusters`
2. 批次级迭代建议：基于 `clusters[].modifications`
3. 候选版本执行结果：基于 `iteration_skill_modifications.changes`
4. 任务级问题详情分析：基于 `task_analysis_results.analysis_comment`

本轮不新增新的业务流程，只调整页面与后端的读取、聚合和展示逻辑。

---

## 3. 涉及表与职责

### 3.1 `public.t_poi_key_property_check_result_ext`

职责：

- 人工标注结果池主表
- 样本级事实字段来源
- 问题任务列表与问题详情页中的“核实结果 / 质检结果 / 人工标注结果”来源

### 3.2 `public.iteration_overlay_drafts`

职责：

- 批次级问题簇分析
- 批次级标签分布统计
- 面向 skill 的建议修改草稿
- Prompt 产物归档

### 3.3 `public.iteration_skill_modifications`

职责：

- 实际执行后的技能修改结果
- 候选版本执行状态
- 成功 / 失败信息
- 与问题簇的 `cluster_id` 关联

### 3.4 `public.task_analysis_results`

职责：

- 单任务级的详情分析结论
- 面向人阅读的长文本分析正文
- 辅助解释当前任务为什么被标记为某类问题

---

## 4. 上游已确认的新规格

## 4.1 `iteration_overlay_drafts.overlay_draft`

新结构核心字段：

- `clusters: []`

每个 `cluster` 至少包含：

- `cluster_id`
- `description`
- `severity`
- `frequency`
- `tags.issue_observations`
- `tags.judgment_dimensions`
- `representative_cases`
- `modifications`

每个 `modification` 至少包含：

- `action`
- `description`
- `before`
- `after`
- `target_file`
- `target_skill`
- `expected_effect`

### 4.1.1 业务语义

- `cluster` 表示一个稳定的问题簇
- `cluster.description` 表示该问题簇的批次级说明
- `cluster.modifications[]` 表示针对该问题簇的建议修改项

## 4.2 `iteration_overlay_drafts.tag_distribution`

新结构核心字段：

- `issue_observations`
- `judgment_dimensions`

### 4.2.1 业务语义

- 用于批次级标签分布统计
- 本轮优先作为后端聚合基础，前端可不必一次性全部展开展示

## 4.3 `iteration_skill_modifications.changes`

新结构核心字段：

- `description`
- `modifications`
- `error`（失败时）

每个 `changes.modifications[]` 至少包含：

- `action`
- `cluster_id`
- `description`
- `target_file`
- `target_skill`
- `expected_effect`

### 4.3.1 业务语义

- `description` 是本次执行结果摘要
- `modifications[]` 是实际执行成功后记录下来的结构化修改项
- `error` 是失败时的错误信息
- `cluster_id` 用于与 `overlay_draft.clusters[].cluster_id` 关联

## 4.4 `task_analysis_results`

本轮重点消费字段：

- `analysis_comment`

可作为辅助字段使用：

- `overall_verdict`
- `created_at`

本轮不要求前端重复展示以下字段，因为与主表或现有详情区高度重复：

- `name`
- `address`
- `poi_type`
- `qc_status`
- `qc_score`
- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `judgment_dimension_tags`
- `issue_observation_tags`
- `manual_comment`

---

## 5. 页面需求

## 5.1 批次列表与顶部摘要

### 5.1.1 列表摘要来源

批次列表中的 `summary` 不再依赖旧 `overlay_draft.summary`，而改为后端根据 `clusters` 聚合生成。

### 5.1.2 摘要目标

让用户在不打开详情页的情况下快速知道：

- 当前批次有多少个问题簇
- 最高频问题集中在哪些方向

---

## 5.2 问题分析区

### 5.2.1 主数据来源

来源：

- `iteration_overlay_drafts.overlay_draft.clusters`

### 5.2.2 展示目标

按问题簇展示：

- 问题标签
- 问题数量
- 关联 skill
- 问题摘要

### 5.2.3 展示语义

本轮页面不再把这里理解为“旧版标签分布统计”，而是理解为“问题簇分析结果”。

---

## 5.3 迭代建议区

### 5.3.1 主数据来源

来源：

- `clusters[].modifications`
- `prompts`
- `prompt_paths`

### 5.3.2 展示目标

每个 skill 分组下，展示：

- 关联 Prompt
- 技能影响摘要
- 建议修改项列表

每条建议修改项至少展示：

- `action`
- `description`
- `before`
- `after`
- `target_file`
- `expected_effect`

---

## 5.4 候选版本区

### 5.4.1 主数据来源

来源：

- `iteration_skill_modifications`

### 5.4.2 展示目标

展示真正执行后的候选版本结果，而不是 overlay 中的建议草稿。

每条记录至少展示：

- `target_skill`
- `status`
- `changes.description`
- 涉及文件
- 关联 `cluster_id`

当执行失败时，需要展示：

- `status = failed`
- `changes.error`

---

## 5.5 问题详情页

## 5.5.1 现有结构

当前问题详情页已有：

1. 数字员工核实结果
2. 数字员工质检结果
3. 人工标注结果
4. 模型分析结果（当前仍为预留/弱实现）

## 5.5.2 本轮新增区块

新增：

- `任务级分析结论`

数据来源：

- `public.task_analysis_results.analysis_comment`

## 5.5.3 任务级分析结论的展示目标

重点展示：

- `analysis_comment`

辅助展示：

- `overall_verdict`
- `created_at`

本轮不要求将 `task_analysis_results` 再做一张字段表平铺展示。

---

## 6. 后端需求

## 6.1 新结构优先、旧结构兜底

后端需要采用：

- 新结构优先解析
- 旧结构兼容兜底

以保证：

- 新批次按新规格稳定展示
- 历史批次不会因结构切换而完全失效

## 6.2 PG / SQLite 行为一致

本轮要求：

- PostgreSQL 仓储与 SQLite mock 仓储采用同一套解析口径
- 避免一边显示正常、一边仍走旧结构

---

## 7. 前端需求

## 7.1 不做大改版

本轮不要求重构 `HITL` 页面布局，而是在现有区块基础上升级数据语义与展示内容。

## 7.2 重点增强区块

本轮重点增强：

1. 问题分析区
2. 迭代建议区
3. 候选版本区
4. 问题详情页中的任务级分析结论区

---

## 8. 非目标

本轮不做：

1. 新增回写数据库流程
2. 新增新的分析任务调度流程
3. 在主页面平铺展示 `task_analysis_results` 的全部字段
4. 把 `steps` 做成完整时间线系统
5. 删除历史旧结构兼容

---

## 9. 验收标准

满足以下条件即视为本轮需求完成：

1. 批次列表摘要能基于 `clusters` 正常展示
2. 问题分析区能展示基于问题簇的根因卡片
3. 迭代建议区能展示结构化建议修改项
4. 候选版本区能展示新 `changes` 结构，并区分成功 / 失败
5. 问题详情页能展示 `analysis_comment` 作为任务级分析正文
6. 新旧结构批次都能打开，不出现空白或报错
