# HITL 页面数据库到前端字段映射清单

## 1. 文档目标

本文档用于收敛 `HITL 迭代运营页` 从当前数据库表适配到前端页面时的字段边界，供逐项确认：

- 哪些字段可以直接从数据库读取
- 哪些字段需要后端聚合或推导
- 哪些字段数据库中已经存在，但前端当前未展示

当前范围覆盖以下六张表：

- `iteration_negative_samples`
- `iteration_overlay_drafts`
- `iteration_skill_modifications`
- `poi_verified_regression_test`
- `poi_verified_regression_test_compare`
- `poi_verified_regression_test_result`

本轮纳入补充：

- 最终结论

原因：

- 回归验证已补齐独立底层数据，可作为最终结论的事实基础
- 最终结论不再依赖新增业务表，先基于核实 / 质检回归指标做决策型聚合

### 1.1 本轮新增前提

数据库中的三张回归表已新增 `batch_id` 字段，并与前置 `HITL` 迭代批次统一到 `batch_0415`。

这意味着：

- 回归验证区本轮可以直接按 `batch_id` 与 `HITL` 主页面关联
- 不再需要用 `dataset_name`、`task_id` 或时间窗做弱关联
- 页面主视角仍以 `batchId` 为主，`dataset_name` 退化为回归区内部的分组维度

---

## 2. 当前页面分区

当前前端 `HITLIterationPage` 主要包含以下信息分区：

1. 批次列表与顶部总览
2. 流程进度
3. 问题根因
4. 迭代建议
5. Skill 版本变更
6. 回归验证
7. 最终结论

本轮重点分析全部七项，其中最终结论基于回归指标做后端聚合，不直接读取独立事实表。

---

## 3. 三张表的业务语义

### 3.1 `iteration_negative_samples`

更接近：

- 人工反馈结果池
- 本轮纳入分析的负样本明细
- 人工纠错与补充证据记录

可支撑的信息方向：

- 批次级样本量
- 问题标签分布
- 人工评语
- 人工补充证据
- 典型 case 明细

### 3.2 `iteration_overlay_drafts`

更接近：

- 模型分析后的聚合结论
- 问题分布
- 根因分析摘要
- 面向各 skill 的修改建议草稿

可支撑的信息方向：

- 批次摘要
- 根因区
- 建议区
- 标签分布
- prompt 产物

### 3.3 `iteration_skill_modifications`

更接近：

- 最终 skill 迭代内容
- 产出的修改摘要
- 修改目标 skill / 文件
- 修改状态

可支撑的信息方向：

- Skill 变更记录
- 修改摘要
- 修改覆盖的问题类型
- 修改文件列表

### 3.4 `poi_verified_regression_test`

更接近：

- 候选版本进入回归时的样本全集
- 单条样本的真值 / 当前结果 / 核实后结果对照
- 回归样本详情下钻的数据底表

可支撑的信息方向：

- 数据集维度的样本规模
- 正负样本拆分
- 单条样本详情
- 核实证据与 `verify_info` 展示

### 3.5 `poi_verified_regression_test_compare`

更接近：

- 回归后与真值不一致的差异明细
- 本轮候选版本相对基线的变化记录
- 适合作为“变化摘要 / 风险明细 / 典型波动 case”来源

可支撑的信息方向：

- 一致 / 不一致数量
- 核实结论变化
- 质检结论变化
- 名称 / 地址 / 类型 / 行政区划 / 状态等字段变化

### 3.6 `poi_verified_regression_test_result`

更接近：

- 每次回归运行的汇总结果
- 回归区顶部 KPI 的最佳事实来源

可支撑的信息方向：

- 总样本数
- 正负样本数
- 核实提升率 / 逆向率
- 质检提升率 / 逆向率
- 总体提升率 / 逆向率

---

## 4. 可直接从数据库读取的字段

这一类字段不需要复杂业务推导，后端做轻量映射即可。

### 4.1 顶部批次列表 / 批次总览

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `batchId` | `iteration_negative_samples.batch_id` | 直接读取 | 当前确认以 `iteration_negative_samples` 为主口径 |
| `sampleCount` | `iteration_negative_samples` | `count(*) by batch_id` | 直接聚合 |
| `startedAt` | `iteration_negative_samples.updatetime` | 取批次内最早时间 | 当前确认先使用 `updatetime`，暂不使用 `qc_time` |
| `summary` | `iteration_overlay_drafts.overlay_draft.summary` | 直接映射 | 批次摘要的最佳直接来源 |

说明：

- `name` 当前确认先弱化，前端可不展示，改为强化 `batchId`
- `issueCount` 需要按人工标注口径聚合，仍属于后端统一统计字段

#### 4.1 已确认口径

用户已确认：

1. `batchId` 以 `iteration_negative_samples.batch_id` 为准
2. `startedAt` 先使用 `updatetime`
3. `name` 暂时弱化，前端可不展示
4. `issueCount` 口径为：
   - 人工标注的任意维度错误都算问题
   - 当前可落到以下人工字段的任一异常判断：
     - `verify_content_is_correct = 0`
     - `verify_action_is_correct = 0`
     - `qc_intercept_is_correct = 0`
     - `evidence_status` 为异常态，如 `0/2/冲突` 等非正常值
     - `issue_observation_tags` 非空
     - `judgment_dimension_tags` 非空

补充说明：

- 其中 `issue_observation_tags` 是“问题现象标签”
- `judgment_dimension_tags` 是“判断维度标签”
- 两者都应计入 `issueCount`

### 4.2 根因区

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `title` | `overlay_draft.issue_distribution[].issue_type` | 直接映射，并补中文描述 | 如 `evidence_missing / 关键证据缺失` |
| `count` | `overlay_draft.issue_distribution[].count` | 直接映射 | 已是聚合结果 |
| `summary` | `overlay_draft.learnable_patterns` / `root_cause_analysis` | 直接取摘要文本 | 可由后端做轻量裁剪 |
| `skillType` | `overlay_draft.issue_distribution[].step` | 直接映射 | 不做额外转换，可补充中英文展示 |

#### 4.2 已确认口径

用户已确认：

1. `title` 可以直接映射 `issue_type`
2. `title` 需要补中文描述，中文口径可参考人工标注表中的英文注释
3. `skillType` 直接映射即可，不做额外业务转换
4. 页面上可增加 `skillType` 的中英文展示，但底层值保持原始 skill 名称

建议维护一份标签展示字典，用于前端显示，不改变底层存储值。例如：

| 原始值 | 中文展示 |
|---|---|
| `evidence_missing` | 关键证据缺失 |
| `evidence_invalid` | 证据无效 |
| `evidence_conflicting` | 证据冲突 |
| `invalid_evidence_cited` | 无效证据误引用 |
| `name_judgment_problem` | 名称判断问题 |
| `address_judgment_problem` | 地址判断问题 |
| `type_judgment_problem` | 类型判断问题 |
| `location_judgment_problem` | 坐标判断问题 |
| `admin_judgment_problem` | 行政区划判断问题 |
| `evidence_usage_problem` | 证据使用问题 |
| `manual_escalation_strategy_problem` | 核实升级策略问题 |
| `qc_intercept_rule_problem` | 质检拦截策略问题 |

`skillType` 也可按展示层补充中英文，例如：

| 原始值 | 建议展示 |
|---|---|
| `verification` | 核实 Skill / Verification |
| `qc-stable` | 质检 Skill / QC Stable |
| `evidence-collection` | 证据收集 Skill / Evidence Collection |

### 4.3 Skill 版本变更区

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `targetSkill` | `iteration_skill_modifications.target_skill` | 直接映射 | 如 `verification`、`qc-stable` |
| `modifiedFile` | `iteration_skill_modifications.modified_file` | 直接映射 | 可直接展示 |
| `status` | `iteration_skill_modifications.status` | 直接映射 | 如 `success` |
| `updatedAt` | `iteration_skill_modifications.created_at` | 直接映射 | 当前样例无独立更新时间 |
| `changeSummary` | `iteration_skill_modifications.changes.summary` | 直接映射 | 最适合当前版本区主摘要 |
| `modifiedFiles` | `changes.modified_files` | 直接映射 | 当前部分样例有，部分无 |
| `rootCausesAddressed` | `changes.root_causes_addressed` | 直接映射 | 很适合前端补充展示 |

### 4.4 可直接提供的样本明细原始字段

以下字段不一定出现在当前页面，但数据库本身已经可直接支撑样本级展示：

- `task_id`
- `name`
- `address`
- `city`
- `poi_type`
- `verify_result`
- `quality_status`
- `qc_status`
- `qc_score`
- `is_qualified`
- `has_risk`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_url`
- `manual_added_evidence_type`
- `manual_added_evidence_abstract`
- `verify_info`
- `evidence_record`

这些字段适合后续扩展“典型 case 列表”“样本抽屉”或“人工反馈详情”。

#### 4.4 已确认的下钻交互

用户已确认可新增一条交互链路：

- 在“问题根因”区增加“查看问题详情”的交互入口
- 用户点击后，跳转到详情页
- 详情页展示该问题类型下被人工标注的具体任务

这条链路建议的数据来源仍以 `iteration_negative_samples` 为主，按问题标签过滤任务。

建议后端后续支持：

- 按 `batch_id + issue_type` 查询任务列表
- 返回任务基础信息、人工标注字段与人工说明

建议详情页最小展示字段：

- `task_id`
- `name`
- `address`
- `city`
- `poi_type`
- `verify_result`
- `quality_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_url`
- `manual_added_evidence_type`
- `manual_added_evidence_abstract`

用户已进一步确认：

- 问题详情页新增为 `HITL` 专属详情页
- 不复用现有任务详情能力

详情页建议展示四块核心信息：

1. 数字员工核实结果
2. 数字员工质检结果
3. 人工标注结果
4. 模型分析结果

### 4.5 回归验证区可直接读取的字段

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `batchId` | 三张回归表的 `batch_id` | 直接过滤 | 本轮已确认统一为 `batch_0415` |
| `datasetName` | `poi_verified_regression_test_result.dataset_name` | 直接映射 | 作为回归区内部的分组标题 |
| `runAt` | `poi_verified_regression_test_result.updatetime` | 直接映射 | 用于展示最近一次回归运行时间 |
| `runId` | `poi_verified_regression_test_result.timestamp_suffix` | 直接映射 | 作为一次回归运行的轻量标识 |
| `totalCount` | `poi_verified_regression_test_result.total_count` | 直接映射 | 总样本数 |
| `positiveCount` | `poi_verified_regression_test_result.positive_count` | 直接映射 | 正样本数 |
| `negativeCount` | `poi_verified_regression_test_result.negative_count` | 直接映射 | 负样本数 |
| `verifyBetterRatio` | `poi_verified_regression_test_result.verify_better_ratio` | 直接映射 | 核实提升率 |
| `verifyWorsenRatio` | `poi_verified_regression_test_result.verify_worsen_ratio` | 直接映射 | 核实逆向率 |
| `qcBetterRatio` | `poi_verified_regression_test_result.qc_better_ratio` | 直接映射 | 质检提升率 |
| `qcWorsenRatio` | `poi_verified_regression_test_result.qc_worsen_ratio` | 直接映射 | 质检逆向率 |
| `totalBetterRatio` | `poi_verified_regression_test_result.total_better_ratio` | 直接映射 | 总体提升率 |
| `totalWorsenRatio` | `poi_verified_regression_test_result.total_worsen_ratio` | 直接映射 | 总体逆向率 |

### 4.6 回归变化明细可直接读取的字段

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `isConsistent` | `poi_verified_regression_test_compare.is_consistent` | 直接映射 | 可用于“一致 / 不一致”统计 |
| `sampleType` | `poi_verified_regression_test_compare.sample_type` | 直接映射 | 正样本 / 负样本 |
| `compareVerifyResult` | `compare_verify_result` | 直接映射 | 基线核实结论 |
| `newVerifyResult` | `new_verify_result` | 直接映射 | 候选版本核实结论 |
| `compareQcStatus` | `compare_qc_status` | 直接映射 | 基线质检结论 |
| `newQcStatus` | `new_qc_status` | 直接映射 | 候选版本质检结论 |
| `compareName / compareAddress / comparePoiType / compareCityAdcode / compareStatus` | `compare_*` | 直接映射 | 这些字段本身已是 `old->new` 差异串 |
| `taskId` | `poi_verified_regression_test_compare.task_id` | 直接映射 | 回归执行明细标识 |
| `id` | `poi_verified_regression_test_compare.id` | 直接映射 | POI 业务主键 |

### 4.7 回归样本详情可直接读取的字段

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `sampleType` | `poi_verified_regression_test.sample_type` | 直接映射 | 正样本 / 负样本 |
| `curVerifyResult` | `cur_verify_result` | 直接映射 | 当前核实结论 |
| `curQcStatus` | `cur_qc_status` | 直接映射 | 当前质检结论 |
| `verifiedVerifyResult` | `verified_verify_result` | 直接映射 | 候选版本核实结论 |
| `name / address / poiType / city / cityAdcode` | 当前输入字段 | 直接映射 | 输入侧 |
| `trueName / trueAddress / truePoiType / trueCity / trueCityAdcode` | 真值字段 | 直接映射 | 真值侧 |
| `verifiedName / verifiedAddress / verifiedPoiType / verifiedCity / verifiedCityAdcode` | 核实后字段 | 直接映射 | 候选版本输出侧 |
| `verifyInfo / evidenceRecord` | JSON 字段 | 直接透传 | 用于样本详情抽屉或详情页 |

其中建议的数据来源如下：

| 详情页分区 | 主要数据来源 |
|---|---|
| 数字员工核实结果 | `verify_result`、`verify_info`、`evidence_record` |
| 数字员工质检结果 | `quality_status`、`qc_status`、`qc_score` |
| 人工标注结果 | `verify_content_is_correct`、`verify_action_is_correct`、`qc_intercept_is_correct`、`evidence_status`、`issue_observation_tags`、`judgment_dimension_tags`、`manual_comment`、`conflicting_evidence`、`manual_added_evidence_*`、人工修正结果字段 |
| 模型分析结果 | 需要后端按 `batch_id + issue_type` 从 `iteration_overlay_drafts` 中抽取对应问题类型的聚合分析与 Prompt 内容 |

---

## 5. 需要后端聚合或推导的字段

这一类字段数据库不是没有，而是当前前端需要的是“页面视图字段”，不能直接把原表原样暴露给前端。

### 5.1 批次卡片中的 `name`

当前数据库没有独立的“批次名称”字段。

可选方式：

1. 前端直接展示 `batch_id`
2. 后端对 `batch_id` 做格式化别名
3. 后续新增业务侧批次元信息表

结论：

- 本轮若不新增元数据表，则 `name` 需要后端聚合或格式化，不属于直接字段

#### 5.1 已确认口径

该项已在 `4.1` 中确认：

- `name` 暂时弱化
- 前端可不展示
- 批次卡以强化 `batchId` 为主

### 5.2 批次卡片中的 `issueCount`

问题不在于能不能算，而在于需要先统一统计口径。

当前候选口径：

1. `issue_observation_tags` 非空即记为问题
2. `judgment_dimension_tags` 非空即记为问题
3. `manual_comment` 非空即记为问题
4. 以上任一满足即记为问题

结论：

- 应由后端统一聚合口径
- 不建议前端自行定义

#### 5.2 已确认口径

该项已在 `4.1` 中确认：

- `issueCount` 由后端统一聚合
- 统计口径为“人工标注的任意维度错误都算问题”

### 5.3 批次卡片中的 `status`

当前三张表没有页面语义下的现成状态字段。

如果本轮需要保留状态，可考虑后端按最小规则推导：

- 有负样本，无 overlay：`反馈池已形成`
- 有 overlay，无 modifications：`分析完成`
- 有 modifications：`已形成修改产物`

但如果继续保留当前 mock 页那种六阶段状态：

- `analysis`
- `iterating`
- `regressing`
- `completed`
- `rollback`

则会明显超出现有数据真实支撑范围。

结论：

- 当前 `status` 需要后端推导
- 更推荐前端简化状态表达，而不是维持现有 mock 页的完整流程态

#### 5.3 已确认口径

用户已确认：

- `status` 可以由后端推导
- 推导结果应与 `5.4` 的流程进度保持一致

因此本轮建议：

- 批次卡片中的状态不再单独设计另一套业务语义
- 直接复用流程进度的阶段结果
- 页面展示上保持“批次状态”和“流程进度”一致

### 5.4 流程进度区 `flowSteps`

当前前端有六步：

1. 反馈池
2. 问题分析
3. 迭代处理
4. 候选版本
5. 回归验证
6. 最终结论

其中本轮真实数据能支撑的只有前四步：

- `反馈池`：来自 `iteration_negative_samples`
- `问题分析`：来自 `iteration_overlay_drafts`
- `迭代处理`：来自 `iteration_skill_modifications`
- `候选版本`：可由 `iteration_skill_modifications` 的成功修改结果弱表达

每一步的 `summary` 需要后端拼装，例如：

- 样本量
- 高频问题
- 已影响 skill 数
- 产出修改文件数

结论：

- `flowSteps` 需要后端聚合
- 流程区保留六步结构，但未 ready 的步骤允许展示“待补充”态

#### 5.4 当前确认结果

结合用户对 `5.3` 的确认，可先收敛为：

- 流程进度由后端统一聚合
- 批次卡片中的 `status` 与流程进度使用同一套阶段语义

用户已确认：

- 流程区不做缩减，继续保留当前六步

因此本轮流程区口径调整为：

1. 反馈池
2. 问题分析
3. 迭代处理
4. 候选版本
5. 回归验证
6. 最终结论

补充说明：

- 虽然 `回归验证` 与 `最终结论` 当前数据库尚未 ready，但页面流程区仍保留六步结构
- 后端可对未 ready 的步骤输出“暂无数据 / 待补充”态，而不是删除节点
- 批次卡片中的 `status` 仍应与这六步流程语义保持一致

### 5.5 建议区 `suggestions`

当前数据库里有“建议相关信息”，但不是直接一行一条建议卡。

建议区的候选来源：

- `overlay_draft.skill_impact`
- `overlay_draft.prompts`
- `iteration_skill_modifications.changes.root_causes_addressed`
- `iteration_skill_modifications.changes.summary`

因此这块更适合后端统一裁剪成：

- 目标 skill
- 问题类型
- 修改方向
- 修改摘要
- 关联 prompt / 文件

结论：

- `suggestions` 需要后端聚合
- 不适合前端直接消费原始 JSON

#### 5.5 已确认口径

用户已确认：

- 迭代建议区直接展示 Prompt

因此本轮建议调整为：

- 建议区以 `iteration_overlay_drafts.prompts` 为主数据源
- 后端不再把 Prompt 深度裁剪成高度摘要化的建议卡
- 后端主要负责：
  - 把 `prompts` 中不同 skill 的 prompt 按展示顺序整理好
  - 补充 skill 名称、中文说明、来源文件名等轻量元信息

前端建议展示结构：

- Skill 名称
- Prompt 文件名
- Prompt 正文

### 5.6 版本区中的 `versionFrom / versionTo`

### 5.6 版本区中的 `versionFrom / versionTo`

当前样例数据里没有稳定的显式版本起止字段。

已有信息更多是：

- `changes.summary`
- `target_skill`
- `modified_file`
- `status`
- `created_at`

如果强行展示 `versionFrom / versionTo`，只能从摘要文本中做弱解析。

结论：

- 本轮不建议保留强版本号展示
- 更建议改为“目标 Skill + 修改摘要 + 文件 + 状态 + 时间”

#### 5.6 已确认口径

用户已确认版本区按以下结构展示：

- 目标 Skill
- 修改摘要
- 文件
- 状态
- 时间

因此本轮版本区字段建议固定为：

| 展示字段 | 数据来源 |
|---|---|
| 目标 Skill | `target_skill` |
| 修改摘要 | `changes.summary` |
| 文件 | `modified_file` 或 `changes.modified_files` |
| 状态 | `status` |
| 时间 | `created_at` |

---

## 6. 数据库里有、但前端当前未展示的高价值字段

这一部分是后续决定“前端是精简展示还是增加展示”时最值得优先考虑的扩展候选。

### 6.1 来自 `iteration_negative_samples`

| 字段 | 价值 | 适合的页面用法 |
|---|---|---|
| `manual_comment` | 直接保留人工反馈原话 | 典型 case / 人工评语区 |
| `issue_observation_tags` | 问题观察标签 | 标签分布 / 问题聚类 |
| `judgment_dimension_tags` | 判断维度问题标签 | 根因分层 / 维度分析 |
| `conflicting_evidence` | 证据冲突文本 | 冲突样本区 |
| `manual_added_evidence_url/type/abstract` | 人工补充证据 | 补证据卡片 |
| `verify_content_is_correct` | 人工判断核实内容是否正确 | 人工判责维度统计 |
| `verify_action_is_correct` | 人工判断核实动作是否正确 | 人工判责维度统计 |
| `qc_intercept_is_correct` | 人工判断 QC 拦截是否正确 | 人工判责维度统计 |
| `evidence_status` | 证据状态 | 证据质量分层 |
| `verified_name / verified_addr / verified_poi_type / verified_city_adcode` | 人工最终修正结果 | 修正前后对照 |

### 6.2 来自 `iteration_overlay_drafts`

| 字段 | 价值 | 适合的页面用法 |
|---|---|---|
| `tag_distribution` | 已是聚合统计结果 | 标签统计卡 |
| `prompt_paths` | 展示本轮影响了哪些 prompt 文件 | Prompt 影响范围 |
| `prompts` | 模型给出的详细修改提示词 | 建议详情 / 展开面板 |
| `overlay_draft.learnable_patterns` | 已沉淀可学习模式 | 模式总结区 |
| `overlay_draft.root_cause_analysis` | 现成根因摘要 | 根因解释区 |

### 6.3 来自 `iteration_skill_modifications`

| 字段 | 价值 | 适合的页面用法 |
|---|---|---|
| `backup_path` | 体现改动可回退性 | 可回滚信息 |
| `changes.modified_files` | 展示影响文件清单 | 版本变更详情 |
| `changes.root_causes_addressed` | 展示“问题 -> 修改动作”的映射 | 修改闭环说明 |
| `status` | 展示执行结果 | 变更状态标识 |

---

## 7. 建议的前端收敛方向

如果目标是“本轮尽快从 mock 切到真数据”，建议前端按如下方向收敛。

### 7.1 建议保留

- 批次列表
- 问题根因
- 迭代建议
- Skill 版本变更
- 回归验证

### 7.2 建议保留现有流程区结构

流程区保留当前六步，不做缩减：

1. 反馈池
2. 问题分析
3. 迭代处理
4. 候选版本
5. 回归验证
6. 最终结论

原因：

- 用户已确认页面层仍保留完整运营闭环表达
- 即使部分步骤当前暂无真实数据，也可以先以“待补充”态展示

### 7.3 建议暂停

- 最终结论

原因：

- 当前库中仍无稳定、可审计的事实字段
- 若强行从回归结果反推最终结论，容易把“回归事实”与“发布决策”混在一起

### 7.4 回归验证区展示方案

在 `batch_id` 已打通的前提下，当前更推荐把回归区设计成“两层结构”：

#### 主页面：核实 / 质检双摘要

展示内容：

- 回归运行时间
- 数据集 / 运行批次标识
- 样本规模摘要：总样本、正样本、负样本
- `核实回归` 指标卡
  - 核实提升率
  - 核实逆向率
  - 查看详情
- `质检回归` 指标卡
  - 质检提升率
  - 质检逆向率
  - 查看详情

优点：

- 主页面聚焦“这轮回归是否健康”
- 天然贴合用户对“核实”和“质检”两条链路分别观察的需求
- 不会把字段变化和样本明细直接堆在主页面

代价：

- 明细信息必须下钻到详情页
- 需要定义详情页的分 tab / 分视图逻辑

#### 详情页：对应回归明细

展示内容：

- 进入方式：
  - 从 `核实回归` 卡进入核实回归详情
  - 从 `质检回归` 卡进入质检回归详情
- 页面建议展示：
  - 顶部摘要：运行时间、数据集、样本规模、当前回归类型
  - 指标摘要：当前回归类型下的提升率 / 逆向率
  - 明细列表：对应样本的结论变化与字段差异
  - 明细下钻：查看某条回归样本的真值 / 当前结果 / 候选结果 / 证据

优点：

- 主页面保持克制，详情页承担解释和复盘
- 用户可以按“核实”或“质检”分别排查，不会混淆

代价：

- 需要新增回归详情页路由与接口
- 要先定义“核实详情页看哪些字段，质检详情页看哪些字段”

### 7.5 当前推荐方案

当前推荐采用 **“主页面双摘要 + 回归详情页”**。

原因：

- 比单纯 KPI 更完整，用户能继续追到明细
- 比在主页面堆变化摘要或典型样本更克制
- 与当前 HITL 页“主页面看全局、详情页看明细”的整体交互风格一致

### 7.6 已确认的新增交互

优先新增：

1. 在问题根因区增加“查看问题详情”的交互
2. 跳转到详情页展示该问题类型下的人工标注任务

这比直接新增一个独立静态分区更贴近当前页面主链路，也更方便从聚合问题下钻到具体任务。

---

## 8. 建议的后端接口边界

如果后续按 A 方案推进，建议新增页面专用聚合接口，而不是让前端直接读取三张原始表。

建议接口：

- `GET /api/hitl/iterations`
  - 返回批次列表总览

- `GET /api/hitl/iterations/:batchId`
  - 返回页面 detail

- `GET /api/hitl/iterations/:batchId/issues/:issueType/tasks`
  - 返回某个问题类型下的人工标注任务明细
  - 用于“问题根因 -> 问题详情页”的下钻链路

其中 `detail` 建议拆成：

- `overview`
- `flow`
- `rootCauses`
- `suggestions`
- `modifications`
- `rawStats`

---

## 9. 当前推荐结论

当前推荐先按以下原则继续：

1. 顶部批次卡保留，但弱化 `decision`
2. 根因区优先直接复用 `overlay_draft.issue_distribution`
3. 建议区直接展示 Prompt，由后端补充轻量元信息
4. 版本变更区改成真实字段展示：
   - `target_skill`
   - `modified_file`
   - `changes.summary`
   - `status`
   - `created_at`
5. 回归验证区本轮按 `batch_id = batch_0415` 直接关联回归三表，不再做弱关联
6. 回归验证区优先采用“主页面双摘要 + 回归详情页”方案：
   - 主页面分别展示 `核实回归` 与 `质检回归`
   - 明细数据统一下钻到回归详情页
7. 在问题根因区增加“查看问题详情”的下钻能力，优先展示人工标注任务，而不是先做新的静态信息块

### 9.1 回归验证区建议字段映射

建议把回归验证区拆成三个子块：

#### A. 回归结果总览

- `runAt` ← `poi_verified_regression_test_result.updatetime`
- `datasetName` ← `poi_verified_regression_test_result.dataset_name`
- `sampleSummary` ← `total_count / positive_count / negative_count`
- `runId` ← `poi_verified_regression_test_result.timestamp_suffix`

#### B. 核实回归卡

- `betterRatio` ← `verify_better_ratio`
- `worsenRatio` ← `verify_worsen_ratio`
- `detailType` ← 固定为 `verify`
- `detailTitle` ← `核实回归详情`

#### C. 质检回归卡

- `betterRatio` ← `qc_better_ratio`
- `worsenRatio` ← `qc_worsen_ratio`
- `detailType` ← 固定为 `qc`
- `detailTitle` ← `质检回归详情`

### 9.2 回归详情页建议字段映射

建议新增 `HITL` 专属回归详情页，而不是把回归明细继续压回主页面。

#### A. 页首摘要

- `batchId` ← 查询参数 / 路由参数
- `regressionType` ← `verify | qc`
- `datasetName` ← `poi_verified_regression_test_result.dataset_name`
- `runAt` ← `poi_verified_regression_test_result.updatetime`
- `runId` ← `poi_verified_regression_test_result.timestamp_suffix`
- `sampleSummary` ← `total_count / positive_count / negative_count`

#### B. 指标摘要

当 `regressionType = verify`：

- `betterRatio` ← `verify_better_ratio`
- `worsenRatio` ← `verify_worsen_ratio`

当 `regressionType = qc`：

- `betterRatio` ← `qc_better_ratio`
- `worsenRatio` ← `qc_worsen_ratio`

#### C. 明细列表

回归详情页的明细主数据建议来自 `poi_verified_regression_test_compare`。

通用字段：

- `consistentCount` ← `count(*) where is_consistent = '是'`
- `inconsistentCount` ← `count(*) where is_consistent = '否'`
- `sampleType` ← `sample_type`
- `isConsistent` ← `is_consistent`
- `nameChange` ← `compare_name`
- `addressChange` ← `compare_address`
- `typeChange` ← `compare_poi_type`
- `adcodeChange` ← `compare_city_adcode`
- `statusChange` ← `compare_status`
- `taskId` ← `task_id`
- `id` ← `id`

当 `regressionType = verify`：

- 主展示变化字段：
  - `compare_verify_result`
  - `new_verify_result`
- 排序优先建议：
  - 逆向样本优先
  - 结论发生变化的样本优先
  - `is_consistent = '否'` 优先

当 `regressionType = qc`：

- 主展示变化字段：
  - `compare_qc_status`
  - `new_qc_status`
- 排序优先建议：
  - 逆向样本优先
  - 质检结论发生变化的样本优先
  - `is_consistent = '否'` 优先

#### D. 样本详情抽屉 / 二级详情

样本详情建议再读 `poi_verified_regression_test`，用于展示：

- 输入数据：`name / address / poi_type / city / city_adcode`
- 真值数据：`true_*`
- 候选结果：`verified_* / verified_verify_result`
- 当前结果：`cur_verify_result / cur_qc_status`
- 证据与解释：`verify_info / evidence_record`

说明：

- `compare_*` 字段本身已是 `old->new` 文本，不必再额外拼接
- `verify` 与 `qc` 两类详情页共享底表，但主展示字段和默认排序应不同

---

## 10. 待逐项确认的问题

以下问题建议逐项确认后，再进入实现：

当前待确认问题已清空，可以进入接口与页面实现设计。

## 11. 已确认项

截至当前，已确认如下：

1. `batchId` 以 `iteration_negative_samples.batch_id` 为准
2. `startedAt` 先使用 `updatetime`
3. `name` 暂时弱化，前端可不展示
4. `issueCount` 按人工标注的任意维度错误计入
5. 根因区 `title` 直接映射原始标签，同时补中文描述
6. 根因区 `skillType` 直接映射原始 skill 名称，不做额外转换，但可补中英文展示
7. 批次卡片中的 `status` 由后端推导，并与流程进度保持一致
8. 建议区直接展示 Prompt
9. 版本区改为“目标 Skill + 修改摘要 + 文件 + 状态 + 时间”
10. 流程区保留六步，不做缩减
11. 在问题根因区增加“查看问题详情”的交互，并跳转展示人工标注的具体任务
12. 问题详情页新增为 `HITL` 专属详情页，展示数字员工核实结果、质检结果、人工标注结果、模型分析结果
13. 回归验证区本轮纳入真实字段映射，不再维持“待补充”前提
14. 回归三张表已新增 `batch_id`，并与前置 `HITL` 批次统一到 `batch_0415`
15. 回归区内部以 `dataset_name + updatetime / timestamp_suffix` 作为展示分组，不替代页面主 `batchId`


### 9.2 最终结论区建议字段映射

建议把最终结论区设计成“决策卡 + 原因列表”两层结构。

#### 决策卡

页面核心不是展示一个普通状态标签，而是突出：

- `建议上线`
- `建议回滚`
- `建议人工复核`

建议字段：

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `decision` | 后端聚合字段 | 基于核实 / 质检回归指标推导 | 枚举：`launch` / `rollback` / `review` |
| `decisionLabel` | 后端聚合字段 | 展示中文文案 | 如“建议上线” |
| `decisionReasonSummary` | 后端聚合字段 | 拼接主要原因 | 用于主卡副标题 |
| `verifyWorsenRatio` | `poi_verified_regression_test_result.verify_worsen_ratio` | 直接映射 | 决策依据之一 |
| `verifyBetterRatio` | `poi_verified_regression_test_result.verify_better_ratio` | 直接映射 | 决策依据之一 |
| `qcWorsenRatio` | `poi_verified_regression_test_result.qc_worsen_ratio` | 直接映射 | 决策依据之一 |
| `qcBetterRatio` | `poi_verified_regression_test_result.qc_better_ratio` | 直接映射 | 决策依据之一 |
| `runAt` | `poi_verified_regression_test_result.updatetime` | 直接映射 | 说明决策对应哪次回归 |

#### 原因列表

建议把原因拆成结构化条目，而不是只输出一段总结文本：

- 核实回归是否出现明显变差
- 质检回归是否出现明显变差
- 是否存在正向收益可支撑上线
- 是否存在需要人工复核的不确定信号

建议字段：

| 前端字段 | 建议来源 | 处理方式 | 备注 |
|---|---|---|---|
| `reasonItems[].type` | 后端聚合字段 | 枚举化 | 如 `verify_worsen` / `qc_worsen` / `verify_better` |
| `reasonItems[].title` | 后端聚合字段 | 输出简短原因标题 | 如“核实回归出现变差” |
| `reasonItems[].description` | 后端聚合字段 | 输出解释文本 | 如“核实变差比例高于变好比例” |
| `reasonItems[].severity` | 后端聚合字段 | 枚举化 | `high` / `medium` / `low` |
| `reasonItems[].metricValue` | 回归结果表字段 | 直接引用对应指标 | 用于展示具体比例 |

#### 当前建议的推导方向

在没有独立发布决策表的前提下，最终结论区先采用“回归指标驱动的决策聚合”方案：

- 若核实或质检出现明显变差，优先给出 `建议回滚`
- 若核实和质检均未出现明显变差，且存在正向收益，可给出 `建议上线`
- 若指标互相冲突或信号不够明确，则给出 `建议人工复核`

这里的阈值不在本轮文档中硬编码，但页面结构和返回字段应提前按三态决策设计。
