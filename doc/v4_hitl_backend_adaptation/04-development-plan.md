# 开发方案：HITL 页面回归展示与回归详情页

## 1. 开发目标

基于已确认的需求与功能设计，本轮开发目标分为四个可交付阶段：

1. 建立回归摘要与回归详情所需的统一类型与接口契约
2. 在 `/hitl-iterations` 主页面接入核实回归 / 质检回归双摘要卡
3. 新增回归详情页与差异明细接口
4. 让回归详情页以“新旧数据对比”为主线完成展示
5. 在主页面增加基于回归指标的最终结论决策区

---

## 2. 本轮范围与边界

## 2.1 本轮纳入范围

- `HITL` 主页面回归区真实数据接入
- 核实回归 / 质检回归双卡摘要展示
- 回归详情页路由、接口、页面结构
- 回归差异明细表与样本详情抽屉
- 最终结论区后端聚合与前端决策卡展示
- SQLite / PostgreSQL 双仓储同口径实现
- 前端 API、类型、页面、路由改造

## 2.2 本轮不纳入范围

- 新增回归计算任务或回归调度链路
- 重写回归结果生产逻辑
- 新增业务配置表或治理后台
- 对主看板 `/tasks`、`/logs/:taskId` 做统一重构
- 回归指标定义变更

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
- `src/components/dashboard/HITLRegressionDetailPage.tsx`（新增）

---

## 4. 总体实施策略

## 4.1 基本策略

- 后端先行：先统一摘要接口与详情接口，再推进前端接线
- 先接主页面摘要，再接详情页明细，最后补样本抽屉
- 双仓储同步：SQLite / PostgreSQL 保持相同字段返回
- 优先做稳定聚合，不在前端散落业务推导逻辑
- 差异方向、旧值 / 新值拆分优先在后端补齐，降低前端复杂度

## 4.2 推荐开发顺序

1. 统一回归摘要与详情 DTO
2. 实现批次详情中的回归摘要聚合
3. 主页面回归区接线
4. 实现回归详情查询接口
5. 新增回归详情页与明细表
6. 增加样本详情抽屉或二级详情接口
7. 联调与验收

---

## 5. 可执行任务拆解

## 5.1 T1：补齐回归相关类型与接口契约

### 目标

建立主页面回归区与回归详情页所需的统一前后端类型。

### 修改文件

- `server/types.ts`
- `src/lib/dashboardTypes.ts`
- `src/lib/dashboardApi.ts`

### 具体改动

#### `server/types.ts`

新增：

- `HitlIterationRegressionOverview`
- `HitlRegressionSummaryCard`
- `HitlRegressionHeader`
- `HitlRegressionSummary`
- `HitlRegressionDiffDirection`
- `HitlRegressionDiffRow`
- `HitlRegressionDetailResponse`
- `HitlRegressionSampleDetail`（如需抽屉独立接口）

#### `src/lib/dashboardTypes.ts`

同步新增前端类型，字段名与后端一致。

#### `src/lib/dashboardApi.ts`

新增接口方法：

- `fetchHitlRegressionDetail(batchId, regressionType, query)`
- `fetchHitlRegressionSampleDetail(batchId, regressionType, sampleId, query)`（如需要）

并扩展：

- `fetchHitlIterationDetail(batchId)` 返回 `regressionOverview`

### 完成标准

- 回归摘要与回归详情页均不依赖组件内临时类型
- 核实 / 质检共用一套基础结构

---

## 5.2 T2：实现主页面回归摘要聚合

### 目标

让 `/hitl-iterations` 的批次详情返回真实回归摘要。

### 修改文件

- `server/repository.ts`
- `server/repository.pg.ts`
- `server/index.ts`

### 查询来源

- 主来源：`poi_verified_regression_test_result`
- 过滤条件：`batch_id = :batchId`
- 默认选择：同批次下最近一次运行结果

### 聚合内容

输出：

- `verify` 卡片摘要
- `qc` 卡片摘要
- `latestRunAt`
- `datasetName`

### 关键逻辑

- 从 `verify_better_ratio / verify_worsen_ratio` 生成核实卡
- 从 `qc_better_ratio / qc_worsen_ratio` 生成质检卡
- `total_count / positive_count / negative_count` 作为公共样本规模字段
- 如存在多次运行，按时间倒序取最新一条；后续可扩展为可切换运行

### 完成标准

- 主页面可以稳定获得双回归摘要
- 摘要字段与详情页使用同一运行上下文

---

## 5.3 T3：主页面回归区接入真实数据

### 目标

在保留现有页面结构的前提下，把回归区从占位改成真实摘要卡。

### 修改文件

- `src/components/dashboard/HITLIterationPage.tsx`

### 具体改动

- 使用 `regressionOverview.verify`
- 使用 `regressionOverview.qc`
- 渲染回归运行时间、数据集、总样本量
- 渲染变好 / 变差比例
- 每张卡增加“查看详情”按钮
- 点击后跳转到回归详情页

### 完成标准

- 主页面回归区不再展示伪数据或“待补充”占位
- 核实 / 质检口径清晰分离

---

## 5.4 T4：实现回归详情接口

### 目标

提供某批次、某回归类型、某次运行下的差异明细数据。

### 修改文件

- `server/repository.ts`
- `server/repository.pg.ts`
- `server/index.ts`

### 新增接口

- `GET /api/hitl/iterations/:batchId/regressions/:regressionType`

建议查询参数：

- `datasetName`
- `runAt`

### 查询来源

- 汇总来源：`poi_verified_regression_test_result`
- 明细来源：`poi_verified_regression_test_compare`
- 补充详情来源：`poi_verified_regression_test`

### 关键逻辑

#### 明细筛选

- `batch_id = :batchId`
- 若传入 `datasetName`，则按 `dataset_name = :datasetName`
- 若传入 `runAt`，则按运行时间进一步过滤

#### 差异字段映射

当 `regressionType = verify`：

- 主字段读取 `compare_verify_result`
- 次字段读取 `compare_qc_status`
- 输出 `primaryOldValue / primaryNewValue`

当 `regressionType = qc`：

- 主字段读取 `compare_qc_status`
- 次字段读取 `compare_verify_result`
- 输出 `primaryOldValue / primaryNewValue`

#### 方向推导

输出统一字段：

- `diffDirection = better | worsen | same | unknown`

#### 排序建议

后端默认按以下顺序返回：

1. `worsen`
2. `better`
3. `same`
4. `unknown`

### 完成标准

- 回归详情接口能直接支撑页面表格展示
- 页面无需自行拆过多底表字段

---

## 5.5 T5：新增回归详情页

### 目标

新增专属回归详情页，承载摘要指标、差异明细与样本详情。

### 修改文件

- `src/App.tsx`
- `src/components/dashboard/HITLRegressionDetailPage.tsx`

### 路由

新增：

- `/hitl-iterations/:batchId/regressions/:regressionType`

### 页面结构

1. 页首基础信息区
2. 指标摘要区
3. 差异明细表
4. 样本详情抽屉

### 页面重点

- 详情页必须显式展示旧值 / 新值
- 默认优先显示变差样本
- 支持切换“仅看变化”与“查看全部”
- 根据 `regressionType` 动态切换主列标题

### 完成标准

- 页面能够独立承载核实回归与质检回归两种视角
- 差异展示符合“对比优先”的设计要求

---

## 5.6 T6：样本详情抽屉与二级详情

### 目标

让用户可以继续下钻到单条样本的完整差异上下文。

### 修改文件

- `src/components/dashboard/HITLRegressionDetailPage.tsx`
- `server/repository.ts` / `server/repository.pg.ts`（若需独立接口）

### 展示内容

- 样本基础信息
- 核实旧值 / 新值
- 质检旧值 / 新值
- 新结果补充字段
- `verify_info`
- 证据说明
- 必要的人工标注或上下文信息

### 完成标准

- 单条样本可查看更完整的新旧对比
- 详情抽屉不只是原始字段堆叠，而是按差异组织

---

## 5.7 T7：实现最终结论决策聚合与展示

### 目标

基于核实回归与质检回归指标，在主页面输出可直接支撑发布判断的最终结论区。

### 修改文件

- `server/types.ts`
- `server/repository.ts`
- `server/repository.pg.ts`
- `src/lib/dashboardTypes.ts`
- `src/components/dashboard/HITLIterationPage.tsx`

### 具体改动

- 在批次详情返回中新增 `decisionOverview`
- 基于 `verify_*` 与 `qc_*` 指标推导 `launch / rollback / review`
- 同步返回结构化 `reasonItems`
- 主页面渲染“上线 / 回滚 / 人工复核”主结论卡
- 在结论区展示 2-4 条原因说明与关键指标值

### 完成标准

- 最终结论区不再是占位内容
- 用户可以直接看到建议上线或回滚，以及原因说明
- 结论口径与回归摘要指标保持一致

---

## 5.8 T8：联调与验收

### 目标

确保主页面摘要、详情页明细、样本详情三层数据口径一致。

### 验证项

#### 主页面

- 能展示核实回归卡
- 能展示质检回归卡
- 能正确展示运行时间、数据集、样本量
- “查看详情”跳转参数正确

#### 回归详情页

- 页首信息完整
- 指标区与主页面摘要一致
- 明细表默认突出变差样本
- 能正确显示旧值 / 新值
- 核实视角与质检视角列配置不同

#### 最终结论区

- 能正确展示 `建议上线` / `建议回滚` / `建议人工复核`
- 结论原因与关键指标一致
- 结论对应的运行时间与回归摘要一致

#### 样本详情

- 样本抽屉可打开
- 抽屉中能看到完整新旧差异
- 明细数与汇总样本量可基本对齐

---

## 6. 关键实现细节

## 6.1 旧值 / 新值拆分策略

如果底表中的 `compare_*` 字段是组合串，建议在后端统一拆分成：

- `oldValue`
- `newValue`
- `rawDiffText`

这样前端表格和抽屉都可以直接复用，不需要重复写解析逻辑。

## 6.2 视角切换策略

核实页与质检页共用同一页面组件，通过 `regressionType` 控制：

- 指标字段读取哪个比例
- 主对比列读取哪个字段
- 默认表头文案如何展示

## 6.3 性能策略

- 明细表默认分页
- 抽屉重字段可按需加载
- 大文本 / JSON 字段延迟展开

## 6.4 容错策略

- 当次要字段为空时，页面仍应能展示主差异信息
- 当方向无法推导时，标为 `unknown`，但不阻断页面渲染
- 当运行标识缺失时，可退化使用 `batchId + runAt` 作为定位条件
