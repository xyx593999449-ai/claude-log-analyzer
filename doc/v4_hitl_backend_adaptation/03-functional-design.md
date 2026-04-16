# 详细功能设计：HITL 页面后端接入与专属问题详情页

## 1. 设计目标

本设计文档用于把已确认需求收敛成可直接开发的结构化方案，重点解决三件事：

1. 三张表如何映射为 `HITL` 页面主数据
2. 六步流程与批次状态如何统一输出
3. 问题详情页如何组织数字员工结果、人工标注与模型分析

---

## 2. 总体设计

## 2.1 设计原则

- 页面专用聚合：前端不直接消费三张原始表
- SQLite / PostgreSQL 双仓储同口径
- 页面展示口径优先服从已确认文档
- 未 ready 数据使用“待补充”态，不做伪推导

## 2.2 数据源职责

### `iteration_negative_samples`

负责提供：

- 批次主口径
- 样本数量
- 问题数量
- 任务明细
- 人工标注结果
- 数字员工核实 / 质检结果原始字段

### `iteration_overlay_drafts`

负责提供：

- 批次摘要
- 根因分布
- 标签统计
- Prompt
- 模型分析摘要

### `iteration_skill_modifications`

负责提供：

- 目标 Skill
- 修改摘要
- 修改文件
- 变更状态
- 修改时间

---

## 3. 主页面数据设计

## 3.1 页面 DTO 设计

建议新增前后端统一 DTO：

```ts
interface HitlIterationListItem {
  batchId: string;
  startedAt: string | null;
  sampleCount: number;
  issueCount: number;
  summary: string | null;
  status: HitlFlowStatus;
}

interface HitlIterationDetail {
  overview: HitlIterationOverview;
  flow: HitlFlowStep[];
  rootCauses: HitlRootCauseItem[];
  prompts: HitlPromptItem[];
  modifications: HitlModificationItem[];
}
```

## 3.2 批次列表聚合设计

### 来源

- 主来源：`iteration_negative_samples`
- 摘要补充：`iteration_overlay_drafts`
- 状态补充：三表联合推导

### 字段规则

#### `batchId`

- 直接取 `iteration_negative_samples.batch_id`

#### `startedAt`

- 取该批次 `min(updatetime)`

#### `sampleCount`

- `count(*) by batch_id`

#### `issueCount`

按以下任一命中计入问题数：

- `verify_content_is_correct = 0`
- `verify_action_is_correct = 0`
- `qc_intercept_is_correct = 0`
- `evidence_status` 为异常态
- `issue_observation_tags` 非空
- `judgment_dimension_tags` 非空

#### `summary`

- 优先取 `overlay_draft.summary`

---

## 3.3 六步流程设计

## 3.3.1 流程节点

流程区固定输出六步：

1. `feedback`
2. `analysis`
3. `iteration`
4. `candidate`
5. `regression`
6. `decision`

## 3.3.2 流程状态枚举

建议定义：

```ts
type HitlFlowStepStatus = "completed" | "active" | "pending" | "unavailable";
```

说明：

- `completed`：该步骤已有真实产出，且已进入后续阶段
- `active`：当前主要停留步骤
- `pending`：后续步骤，尚未推进
- `unavailable`：当前数据未 ready，但节点仍需展示

## 3.3.3 步骤推导规则

### 反馈池

- 有 `iteration_negative_samples` 数据即视为完成

### 问题分析

- 有 `iteration_overlay_drafts` 即视为完成

### 迭代处理

- 有 `iteration_skill_modifications` 即视为完成

### 候选版本

- 有 `iteration_skill_modifications` 且存在有效 `status` / `modified_file` / `changes` 时可视为完成

### 回归验证

- 当前数据库未 ready
- 输出 `unavailable`

### 最终结论

- 当前数据库未 ready
- 输出 `unavailable`

## 3.3.4 当前步骤推导

建议按最远已完成步骤确定当前阶段：

- 到 `feedback` 为止：当前 `analysis`
- 到 `analysis` 为止：当前 `iteration`
- 到 `iteration` 或 `candidate` 为止：当前 `regression`
- 无回归真实数据时，后续两步均可展示为 `unavailable`

说明：

- 前端流程区展示六步
- 批次卡片 `status` 使用同一阶段语义

---

## 3.4 根因区设计

## 3.4.1 数据来源

- `overlay_draft.issue_distribution`
- `overlay_draft.learnable_patterns`
- `overlay_draft.root_cause_analysis`

## 3.4.2 根因项结构

```ts
interface HitlRootCauseItem {
  issueType: string;
  issueTypeLabel: string;
  count: number;
  skillType: string;
  skillTypeLabel: string;
  summary: string | null;
  detailUrl: string;
}
```

## 3.4.3 展示字典

展示层应维护：

- 问题标签中英文字典
- skill 名称中英文字典

字典只用于展示，不改变底层存储值。

---

## 3.5 建议区设计

## 3.5.1 数据来源

- `iteration_overlay_drafts.prompts`
- `iteration_overlay_drafts.prompt_paths`

## 3.5.2 设计原则

- 直接展示 Prompt，不做深裁剪
- 后端只补充轻量结构信息

## 3.5.3 Prompt 项结构

```ts
interface HitlPromptItem {
  skillKey: string;
  skillLabel: string;
  promptFileName: string;
  promptPath: string | null;
  content: string;
}
```

---

## 3.6 版本区设计

## 3.6.1 数据来源

- `iteration_skill_modifications`

## 3.6.2 展示结构

```ts
interface HitlModificationItem {
  targetSkill: string;
  targetSkillLabel: string;
  changeSummary: string | null;
  modifiedFiles: string[];
  status: string | null;
  createdAt: string | null;
}
```

## 3.6.3 文件字段规则

- 优先使用 `changes.modified_files`
- 若无，则回退 `modified_file`

---

## 4. 问题详情页设计

## 4.1 页面定位

问题详情页是 `HITL` 专属详情页，不复用现有 `/logs/:taskId` 或任务详情卡。

建议路由：

`/hitl-iterations/:batchId/issues/:issueType/tasks/:taskId`

## 4.2 页面结构

### 4.2.1 头部信息

- 批次号
- 问题类型
- 任务 ID
- POI 名称 / 地址 / 城市 / 类型

### 4.2.2 数字员工核实结果

建议展示：

- 核实结论
- 结构化核实信息
- 证据记录

### 4.2.3 数字员工质检结果

建议展示：

- 质检状态
- 质检分数
- 质检结论

### 4.2.4 人工标注结果

建议展示：

- 人工判责布尔字段
- 证据状态
- 问题现象标签
- 判断维度标签
- 人工说明
- 冲突证据说明
- 人工补证据
- 人工最终修正结果

### 4.2.5 模型分析结果

建议展示：

- 当前问题类型的聚合根因说明
- 当前问题类型相关 Prompt
- 当前问题所属 Skill

## 4.3 数据接口设计

### 列表接口

```ts
interface HitlIssueTaskListItem {
  taskId: string;
  name: string | null;
  address: string | null;
  city: string | null;
  poiType: string | null;
  verifyResult: string | null;
  qualityStatus: string | null;
  issueObservationTags: string[];
  judgmentDimensionTags: string[];
  manualComment: string | null;
}
```

### 详情接口

```ts
interface HitlIssueTaskDetail {
  task: HitlIssueTaskBase;
  verifyResult: HitlVerifySection;
  qcResult: HitlQcSection;
  manualResult: HitlManualSection;
  modelAnalysis: HitlModelAnalysisSection;
}
```

---

## 5. 后端查询设计

## 5.1 列表接口查询

按 `iteration_negative_samples.batch_id` 聚合：

- 统计样本量
- 统计问题数
- 左关联 `iteration_overlay_drafts`

## 5.2 批次详情查询

### overview

- 来自负样本表 + overlay 摘要

### flow

- 来自三表存在性与产物情况推导

### rootCauses

- 来自 `overlay_draft.issue_distribution`

### prompts

- 来自 `prompts`

### modifications

- 来自 `iteration_skill_modifications`

## 5.3 问题任务列表查询

以 `iteration_negative_samples` 为主表，按以下字段过滤：

- `batch_id = :batchId`
- `issue_observation_tags` 包含 `:issueType`
  或
- `judgment_dimension_tags` 包含 `:issueType`

说明：

- 由于标签当前为文本字段，SQLite 与 PostgreSQL 均需做兼容解析
- 建议后端统一做字符串拆分与标准化

## 5.4 问题详情查询

### 任务主数据

- 直接从 `iteration_negative_samples` 查单条任务

### 模型分析结果

- 从 `iteration_overlay_drafts` 中读取：
  - 当前问题类型对应的分布项
  - 当前问题类型关联的 Prompt
  - 当前批次聚合根因摘要

---

## 6. 前端页面设计

## 6.1 主页面改造

### 保留

- 现有路由 `/hitl-iterations`
- 现有页面大结构
- 现有六步流程 UI

### 替换

- 全量 mock 数据替换为 API 数据
- 根因区增加“查看问题详情”按钮
- 建议区改为 Prompt 展示
- 版本区改为真实字段展示

## 6.2 详情页新增

新增页面组件建议：

- `src/components/dashboard/HITLIssueDetailPage.tsx`

建议新增 API 方法：

- `fetchHitlIterations()`
- `fetchHitlIterationDetail(batchId)`
- `fetchHitlIssueTasks(batchId, issueType)`
- `fetchHitlIssueTaskDetail(batchId, issueType, taskId)`

---

## 7. 兼容性与风险

### 7.1 风险

- `issue_observation_tags` / `judgment_dimension_tags` 当前是文本字段，解析规则需统一
- `prompts` 为大文本 JSON，直接展示时需要注意折叠与滚动体验
- `模型分析结果` 到任务级不是天然一对一，需要明确“聚合分析下钻到任务”的展示边界
- 回归验证和最终结论当前只能展示待补充态

### 7.2 兼容策略

- SQLite / PostgreSQL 使用统一 DTO
- 标签解析与问题匹配逻辑统一放在仓储层或服务层
- 前端不直接解析原始三表 JSON 字段
