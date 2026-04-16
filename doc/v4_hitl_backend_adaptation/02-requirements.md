# 需求文档：HITL 页面后端接入与专属问题详情页

## 1. 背景与目标

当前 `HITL 迭代运营页` 已完成前端 mock 页面，能够表达以下运营闭环：

- 人工反馈结果池
- 问题分析
- 迭代处理
- 候选版本
- 回归验证
- 最终结论

但当前页面仍主要依赖前端写死数据，尚未真正接入后端，也缺少从聚合问题下钻到具体人工标注任务的详情能力。

本轮目标是在不引入额外业务表的前提下，基于现有三张迭代表完成：

1. `HITL` 页面从 mock 数据切换为真实后端数据
2. 页面字段口径与展示方式统一落盘
3. 保留现有六步流程表达
4. 新增 `HITL` 专属问题详情页
5. 支持从“问题根因”区下钻到某类问题下的人工标注任务详情

本轮仅围绕以下三张表设计：

- `iteration_negative_samples`
- `iteration_overlay_drafts`
- `iteration_skill_modifications`

---

## 2. 用户已确认的核心口径

### 2.1 批次口径

- `batchId` 以 `iteration_negative_samples.batch_id` 为准
- `startedAt` 先使用 `iteration_negative_samples.updatetime`
- `name` 暂时弱化，前端可不展示，强化 `batchId`

### 2.2 问题口径

`issueCount` 按“人工标注的任意维度错误都算问题”统计，至少包含以下任一异常：

- `verify_content_is_correct = 0`
- `verify_action_is_correct = 0`
- `qc_intercept_is_correct = 0`
- `evidence_status` 为异常态
- `issue_observation_tags` 非空
- `judgment_dimension_tags` 非空

### 2.3 根因区口径

- `title` 直接映射 `overlay_draft.issue_distribution[].issue_type`
- 页面展示需要补中文描述
- `skillType` 保持原始值，不做业务转换
- 展示层允许补中英文名称

### 2.4 流程区口径

- 流程区继续保留六步，不做缩减：
  1. 反馈池
  2. 问题分析
  3. 迭代处理
  4. 候选版本
  5. 回归验证
  6. 最终结论
- 当前数据库未 ready 的步骤允许展示“待补充”态
- 批次卡片中的 `status` 与流程进度保持一致，由后端统一推导

### 2.5 建议区与版本区口径

- 建议区直接展示 `prompts`
- 版本区改为真实字段展示：
  - 目标 Skill
  - 修改摘要
  - 文件
  - 状态
  - 时间

### 2.6 问题详情页口径

- 新增 `HITL` 专属问题详情页
- 不复用现有任务详情页
- 从问题根因区点击进入
- 详情页展示四块信息：
  1. 数字员工核实结果
  2. 数字员工质检结果
  3. 人工标注结果
  4. 模型分析结果

---

## 3. 当前现状与问题确认

### 3.1 前端现状

- `/hitl-iterations` 已有完整页面骨架
- 页面已有批次列表、流程区、根因区、建议区、版本区、回归区、结论区
- 页面当前仍依赖前端硬编码 mock 数据

### 3.2 后端现状

- 当前后端主要面向主看板 `/batches`、`/tasks`、`/logs/:taskId`
- 尚无 `HITL` 专用接口
- 尚无 `HITL` 问题详情页接口

### 3.3 数据现状

三张表的业务语义已经相对清晰：

- `iteration_negative_samples`：人工反馈结果池 / 负样本明细 / 人工标注
- `iteration_overlay_drafts`：模型聚合分析结果 / Prompt / 根因分布
- `iteration_skill_modifications`：Skill 修改产物 / 修改摘要 / 状态

当前缺口主要在于：

- 页面字段未完成后端聚合
- 六步流程没有真实状态输出
- 聚合问题无法下钻到具体任务
- 问题详情页还不存在

---

## 4. 本轮产品需求

## 4.1 页面数据接入需求

### 4.1.1 批次列表

页面应支持从后端读取真实批次列表，至少包含：

- `batchId`
- `sampleCount`
- `issueCount`
- `startedAt`
- `summary`
- `status`

约束：

- `batchId` 使用 `iteration_negative_samples.batch_id`
- `name` 暂不展示
- `status` 由后端根据流程阶段统一推导

### 4.1.2 流程区

页面保留当前六步流程结构。

每步至少应包含：

- 步骤标识
- 步骤名称
- 当前状态
- 简要摘要

约束：

- 已有真实数据的步骤展示真实摘要
- 尚未 ready 的步骤展示“待补充”态

### 4.1.3 根因区

根因区应展示：

- 问题标签原始值
- 中文解释
- 数量
- skill 类型
- 根因摘要

并增加“查看问题详情”的交互入口。

### 4.1.4 建议区

建议区直接展示 `prompts`，至少支持：

- skill 名称
- prompt 文件名
- prompt 正文

### 4.1.5 版本区

版本区应改为真实字段展示，不再依赖 mock 版的版本起止号。

最小展示结构：

- 目标 Skill
- 修改摘要
- 文件
- 状态
- 时间

---

## 4.2 问题详情页需求

### 4.2.1 页面入口

在根因区的每个问题项上增加下钻入口。

点击后跳转到专属问题详情页，路径建议包含：

- `batchId`
- `issueType`
- `taskId`

### 4.2.2 页面范围

问题详情页面向“某个问题类型下的某条人工标注任务”，用于统一查看：

- 数字员工原始产出
- 人工标注反馈
- 模型聚合分析上下文

### 4.2.3 页面内容

#### A. 数字员工核实结果

至少展示：

- `verify_result`
- `verify_info`
- `evidence_record`

#### B. 数字员工质检结果

至少展示：

- `quality_status`
- `qc_status`
- `qc_score`

#### C. 人工标注结果

至少展示：

- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`
- `conflicting_evidence`
- `manual_added_evidence_*`
- 人工修正结果字段

#### D. 模型分析结果

至少展示：

- 当前问题类型的聚合根因说明
- 当前问题类型关联的 Prompt 内容
- 当前问题类型与 skill 的映射关系

---

## 5. 接口需求

### 5.1 页面总览接口

新增：

- `GET /api/hitl/iterations`

作用：

- 返回批次列表

### 5.2 页面详情接口

新增：

- `GET /api/hitl/iterations/:batchId`

作用：

- 返回某个批次的页面主数据

### 5.3 问题任务列表接口

新增：

- `GET /api/hitl/iterations/:batchId/issues/:issueType/tasks`

作用：

- 返回某个批次、某种问题类型下的人工标注任务列表

### 5.4 问题任务详情接口

新增：

- `GET /api/hitl/iterations/:batchId/issues/:issueType/tasks/:taskId`

作用：

- 返回 `HITL` 专属问题详情页所需数据

---

## 6. 本轮非目标

本轮明确不纳入：

- 回归验证真实计算逻辑
- 最终结论真实决策逻辑
- 新增独立业务元信息表
- 完整版本号起止解析
- 替换现有主看板任务详情页能力

---

## 7. 验收标准

### 7.1 页面主链路

- `/hitl-iterations` 不再依赖前端写死 mock 数据
- 批次列表、根因区、建议区、版本区均从后端返回
- 六步流程仍完整展示

### 7.2 根因下钻链路

- 用户可从问题根因项点击进入问题详情页
- 页面能够展示该问题类型下的具体人工标注任务

### 7.3 问题详情页

- 页面为 `HITL` 专属页面
- 页面完整展示四块信息：
  - 数字员工核实结果
  - 数字员工质检结果
  - 人工标注结果
  - 模型分析结果

### 7.4 数据一致性

- `batchId`、`startedAt`、`issueCount` 等口径与已确认文档保持一致
- 未 ready 的流程步骤以前端“待补充”态表达，不擅自推导伪结论
