# 开发方案：HITL 页面后端接入与专属问题详情页

## 1. 开发目标

基于已确认的需求与功能设计，本轮开发目标分为四个可交付阶段：

1. 建立 `HITL` 专用类型、接口与仓储查询能力
2. 将 `/hitl-iterations` 从 mock 数据切换为真实后端数据
3. 打通“问题根因 -> 问题详情页”的下钻链路
4. 新增 `HITL` 专属问题详情页

---

## 2. 本轮范围与边界

## 2.1 本轮纳入范围

- `HITL` 页面列表与详情接口
- 根因区下钻接口
- `HITL` 专属问题详情页
- SQLite / PostgreSQL 双仓储实现
- 前端 API、类型、页面、路由改造

## 2.2 本轮不纳入范围

- 回归验证真实结果计算
- 最终结论真实决策计算
- 新增独立业务元数据表
- 主看板 `/tasks` 与 `/logs/:taskId` 的能力重构
- Prompt 内容编辑能力

---

## 3. 预计改造触点

## 3.1 后端

- `server/index.ts`
- `server/types.ts`
- `server/repository.ts`
- `server/repository.pg.ts`
- `server/repositoryFactory.ts`（如需要统一扩展）

## 3.2 前端接口与类型

- `src/lib/dashboardApi.ts`
- `src/lib/dashboardTypes.ts`

## 3.3 前端页面与路由

- `src/App.tsx`
- `src/components/dashboard/HITLIterationPage.tsx`
- `src/components/dashboard/HITLIssueDetailPage.tsx`（新增）

---

## 4. 总体实施策略

## 4.1 基本策略

- 后端先行：先把 DTO、接口、查询收口，再替换前端 mock
- 主页面与详情页分步接线：先保主页面真实化，再补问题详情页
- 双仓储同步：SQLite / PostgreSQL 同口径开发
- 增量替换：保留现有页面骨架与视觉结构

## 4.2 推荐开发顺序

1. 统一类型与接口契约
2. 实现批次列表与批次详情查询
3. 前端主页面接线
4. 实现问题任务列表与任务详情查询
5. 新增问题详情页与跳转链路
6. 联调与验收

---

## 5. 可执行任务拆解

## 5.1 T1：补齐 HITL 类型与接口契约

### 目标

建立 `HITL` 页面与问题详情页所需的统一前后端类型。

### 修改文件

- `server/types.ts`
- `src/lib/dashboardTypes.ts`
- `src/lib/dashboardApi.ts`

### 具体改动

#### `server/types.ts`

新增：

- `HitlFlowStepStatus`
- `HitlIterationListItem`
- `HitlIterationDetail`
- `HitlRootCauseItem`
- `HitlPromptItem`
- `HitlModificationItem`
- `HitlIssueTaskListItem`
- `HitlIssueTaskDetail`

#### `src/lib/dashboardTypes.ts`

同步新增前端类型，字段名与后端一致。

#### `src/lib/dashboardApi.ts`

新增接口方法：

- `fetchHitlIterations()`
- `fetchHitlIterationDetail(batchId)`
- `fetchHitlIssueTasks(batchId, issueType)`
- `fetchHitlIssueTaskDetail(batchId, issueType, taskId)`

### 完成标准

- 前后端类型一致
- 主页面和详情页不再依赖组件内硬编码接口类型

---

## 5.2 T2：实现 HITL 批次列表与页面详情接口

### 目标

让 `/hitl-iterations` 主页面拿到真实数据。

### 修改文件

- `server/repository.ts`
- `server/repository.pg.ts`
- `server/index.ts`

### 新增接口

- `GET /api/hitl/iterations`
- `GET /api/hitl/iterations/:batchId`

### SQLite 实现重点

- 基于 `iteration_negative_samples` 聚合批次列表
- 解析 `issue_observation_tags` / `judgment_dimension_tags`
- 从 `iteration_overlay_drafts` 提取：
  - `summary`
  - `issue_distribution`
  - `prompts`
- 从 `iteration_skill_modifications` 提取版本区信息

### PostgreSQL 实现重点

- 与 SQLite 保持相同字段输出
- 对 JSONB 使用原生查询
- 统一标签拆分逻辑

### 完成标准

- 主页面批次列表、流程区、根因区、建议区、版本区都能拿到真实数据
- 六步流程能稳定输出

---

## 5.3 T3：将 HITLIterationPage 从 mock 切换到真实接口

### 目标

保留现有视觉结构，只替换数据来源与局部展示逻辑。

### 修改文件

- `src/components/dashboard/HITLIterationPage.tsx`

### 具体改动

- 移除页面内硬编码批次和详情 mock
- 页面初始化加载 `fetchHitlIterations()`
- 选中批次后加载 `fetchHitlIterationDetail(batchId)`
- 根因区使用后端返回的：
  - 原始标签
  - 中文标签
  - skill 中英文字段
- 建议区改为 Prompt 展示
- 版本区改为真实字段组合展示
- 回归验证 / 最终结论区保留结构，但显示“待补充”

### 完成标准

- 页面主数据全部来自 API
- 页面结构与已确认方案一致

---

## 5.4 T4：实现问题根因下钻接口

### 目标

支持从某个根因项进入该问题类型下的任务列表与详情。

### 修改文件

- `server/repository.ts`
- `server/repository.pg.ts`
- `server/index.ts`

### 新增接口

- `GET /api/hitl/iterations/:batchId/issues/:issueType/tasks`
- `GET /api/hitl/iterations/:batchId/issues/:issueType/tasks/:taskId`

### 查询规则

#### 问题任务列表

按以下条件查 `iteration_negative_samples`：

- `batch_id = :batchId`
- `issue_observation_tags` 包含 `:issueType`
  或
- `judgment_dimension_tags` 包含 `:issueType`

#### 问题任务详情

按 `batch_id + task_id` 查任务主记录，再拼接：

- 人工标注结果
- 核实 / 质检结果
- overlay 中对应问题类型的模型分析摘要
- overlay 中对应 Prompt

### 完成标准

- 能获取问题类型下的任务列表
- 能获取任务详情页所需完整数据

---

## 5.5 T5：新增 HITL 专属问题详情页

### 目标

新增问题详情页，承载四块结果展示。

### 修改文件

- `src/App.tsx`
- `src/components/dashboard/HITLIssueDetailPage.tsx`

### 具体改动

#### 路由

新增：

- `/hitl-iterations/:batchId/issues/:issueType/tasks/:taskId`

#### 页面结构

1. 头部信息区
2. 数字员工核实结果区
3. 数字员工质检结果区
4. 人工标注结果区
5. 模型分析结果区

#### 交互

- 从根因区点击进入
- 页面支持返回批次页
- 大字段如 `verify_info` / `evidence_record` / Prompt 支持折叠展开

### 完成标准

- 页面独立存在，不复用旧任务详情页
- 四块信息完整展示

---

## 5.6 T6：联调与验收

### 目标

确保主页面、下钻链路、详情页都符合确认口径。

### 验证项

#### 主页面

- 批次列表字段正确
- 流程区保持六步
- 根因区有中文标签和下钻入口
- 建议区直接展示 Prompt
- 版本区字段正确

#### 下钻链路

- 点击根因项可跳转
- 问题类型与批次信息被正确带入

#### 详情页

- 核实结果正确展示
- 质检结果正确展示
- 人工标注结果正确展示
- 模型分析结果正确展示

---

## 6. 关键实现细节

## 6.1 标签解析策略

由于问题标签字段当前是文本存储，建议统一做如下处理：

- 先按英文逗号拆分
- 去掉首尾空格
- 去掉空字符串
- 输出为数组

SQLite / PostgreSQL 都保持同一语义。

## 6.2 未 ready 数据的处理

对于：

- 回归验证
- 最终结论

当前不做伪数据推导，只返回：

- 状态：`unavailable`
- 摘要：`待补充`

## 6.3 模型分析结果的边界

问题详情页中的“模型分析结果”是“该问题类型的批次聚合分析在当前任务上的下钻引用”，不是该任务独立生成的新模型结论。

前端展示时应明确这是：

- 当前问题类型的聚合分析上下文
- 当前批次对应的 Prompt 内容

---

## 7. 风险与应对

### 风险 1：标签字段格式不稳定

应对：

- 仓储层统一封装标签解析函数
- 避免让前端自行 split

### 风险 2：Prompt 文本过长影响页面可读性

应对：

- 前端做折叠面板
- 默认展示标题与前若干行

### 风险 3：模型分析结果与任务粒度不是严格一对一

应对：

- 页面文案明确这是“问题类型聚合分析”
- 不将其误写成任务级独立模型结论

### 风险 4：SQLite 与 PostgreSQL 输出不一致

应对：

- 先定义统一 DTO
- 关键用例两边都做手动校验
