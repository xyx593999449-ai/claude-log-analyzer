# 详细功能设计：HITL 页面回归展示与回归详情页

## 1. 设计目标

本设计文档用于把已确认的回归方案收敛成可直接开发的结构化设计，重点解决三件事：

1. 主页面回归区如何映射核实回归与质检回归摘要
2. 回归详情页如何组织汇总指标、差异明细与样本详情
3. 页面如何突出新旧结果差异，而不是只展示当前值
4. 最终结论区如何基于回归指标聚合成发布决策

---

## 2. 总体设计

## 2.1 设计原则

- 回归区采用页面专用聚合 DTO，前端不直接消费原始表结构
- 主页面摘要与详情页明细共用同一批回归运行上下文
- 详情页以“差异对比”为中心组织字段和交互
- 核实 / 质检共用一套页面骨架，但根据 `regressionType` 切换重点字段

## 2.2 数据源职责

### `poi_verified_regression_test_result`

负责提供：

- 回归运行级摘要
- 样本总量
- 正负样本量
- 核实回归指标
- 质检回归指标
- 运行时间 / 数据集标识

### `poi_verified_regression_test_compare`

负责提供：

- 样本级新旧结果对比
- 核实结果对比字段
- 质检状态对比字段
- 一致性信息
- 样本类型
- 明细列表主表数据

### `poi_verified_regression_test`

负责提供：

- 样本基础信息
- 较完整的核实 / 质检上下文
- 明细抽屉或二级详情数据
- 证据和说明类字段

---

## 3. 主页面回归区设计

## 3.1 页面 DTO 设计

建议新增前后端统一 DTO：

```ts
interface HitlRegressionSummaryCard {
  regressionType: "verify" | "qc";
  title: string;
  batchId: string;
  datasetName: string | null;
  runAt: string | null;
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  betterRatio: number | null;
  worsenRatio: number | null;
  detailUrl: string;
}

interface HitlIterationRegressionOverview {
  batchId: string;
  latestRunAt: string | null;
  datasetName: string | null;
  verify: HitlRegressionSummaryCard | null;
  qc: HitlRegressionSummaryCard | null;
}
```

说明：

- `HitlIterationDetail` 中新增 `regressionOverview`
- 主页面只关心摘要信息，不直接承载样本级对比字段

## 3.2 字段映射设计

### `batchId`

- 直接取三张回归表中的 `batch_id`

### `datasetName`

- 优先取 `dataset_name`
- 若样例中存在运行后缀或时间后缀，可在展示层补充成更完整的运行标识

### `runAt`

- 优先取回归结果表中的 `updatetime`
- 若存在更稳定的运行时间字段，可作为后续统一口径

### `verify.betterRatio`

- 映射 `verify_better_ratio`

### `verify.worsenRatio`

- 映射 `verify_worsen_ratio`

### `qc.betterRatio`

- 映射 `qc_better_ratio`

### `qc.worsenRatio`

- 映射 `qc_worsen_ratio`

### `totalCount / positiveCount / negativeCount`

- 统一来自 `poi_verified_regression_test_result`

## 3.3 主页面展示逻辑

### 核实回归卡

主展示字段：

- `verify_better_ratio`
- `verify_worsen_ratio`
- `total_count`
- `runAt`
- `datasetName`

辅助展示字段：

- `positive_count`
- `negative_count`

### 质检回归卡

主展示字段：

- `qc_better_ratio`
- `qc_worsen_ratio`
- `total_count`
- `runAt`
- `datasetName`

辅助展示字段：

- `positive_count`
- `negative_count`

### 详情跳转参数

建议点击卡片或“查看详情”时透传：

- `batchId`
- `regressionType`
- `datasetName`
- `runAt`

若后端后续定义独立 `runId`，可直接替换 `datasetName + runAt` 的组合定位。



## 3.4 主页面最终结论区设计

### 3.4.1 决策 DTO 设计

```ts
interface HitlIterationDecisionOverview {
  decision: "launch" | "rollback" | "review";
  decisionLabel: string;
  reasonSummary: string | null;
  runAt: string | null;
  verifyBetterRatio: number | null;
  verifyWorsenRatio: number | null;
  qcBetterRatio: number | null;
  qcWorsenRatio: number | null;
  reasonItems: HitlDecisionReasonItem[];
}

interface HitlDecisionReasonItem {
  type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  metricValue: number | null;
}
```

说明：

- `HitlIterationDetail` 中新增 `decisionOverview`
- `decisionOverview` 不依赖独立数据表，而是由回归摘要聚合推导

### 3.4.2 推导输入

主要来自 `poi_verified_regression_test_result`：

- `verify_better_ratio`
- `verify_worsen_ratio`
- `qc_better_ratio`
- `qc_worsen_ratio`
- `total_count`
- `updatetime`

### 3.4.3 推导输出

建议输出三态：

- `launch`
- `rollback`
- `review`

### 3.4.4 推导原则

建议先采用规则型聚合：

- 若任一关键回归维度出现明显变差，则优先输出 `rollback`
- 若核实 / 质检均未见明显变差，且存在稳定正向收益，则输出 `launch`
- 若两类指标出现冲突或无法稳定判断，则输出 `review`

这里的“明显”阈值建议放在实现层配置，不在文档中写死常量。

### 3.4.5 UI 展示重点

最终结论区应突出：

- 大号决策标签：上线 / 回滚 / 人工复核
- 一句结论摘要
- 2-4 条结构化原因
- 与结论相关的关键指标值

页面视觉重心应放在“能否上线”的结论，而不是继续平铺指标。

---

## 4. 回归详情页设计

## 4.1 页面定位

回归详情页是 `HITL` 专属页面，用于承载某次回归运行下的摘要指标与差异明细。

建议路由：

`/hitl-iterations/:batchId/regressions/:regressionType`

建议查询参数：

- `datasetName`
- `runAt`

若后续后端提供更稳定的运行标识，也可调整为：

`/hitl-iterations/:batchId/regressions/:regressionType/:runId`

## 4.2 页面 DTO 设计

```ts
interface HitlRegressionDetailPage {
  header: HitlRegressionHeader;
  summary: HitlRegressionSummary;
  table: HitlRegressionDiffTable;
}

interface HitlRegressionHeader {
  batchId: string;
  regressionType: "verify" | "qc";
  regressionTypeLabel: string;
  datasetName: string | null;
  runAt: string | null;
  totalCount: number;
}

interface HitlRegressionSummary {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  betterRatio: number | null;
  worsenRatio: number | null;
}

interface HitlRegressionDiffRow {
  sampleId: string;
  taskId: string | null;
  poiName: string | null;
  sampleType: string | null;
  isConsistent: boolean | null;
  diffDirection: "better" | "worsen" | "same" | "unknown";
  primaryOldValue: string | null;
  primaryNewValue: string | null;
  primaryDiffText: string | null;
  secondaryOldValue: string | null;
  secondaryNewValue: string | null;
  secondaryDiffText: string | null;
  detailPreview: string | null;
}

interface HitlRegressionDiffTable {
  rows: HitlRegressionDiffRow[];
  changedCount: number;
  worsenCount: number;
  betterCount: number;
}
```

## 4.3 页面结构

### 4.3.1 页首信息区

展示：

- `batchId`
- 回归类型
- `datasetName`
- `runAt`
- `totalCount`

用途：

- 让用户先明确“当前在看哪一批、哪种回归、哪次运行”

### 4.3.2 指标摘要区

当 `regressionType = verify`：

- 展示 `betterRatio = verify_better_ratio`
- 展示 `worsenRatio = verify_worsen_ratio`
- 展示 `positiveCount / negativeCount / totalCount`

当 `regressionType = qc`：

- 展示 `betterRatio = qc_better_ratio`
- 展示 `worsenRatio = qc_worsen_ratio`
- 展示 `positiveCount / negativeCount / totalCount`

### 4.3.3 差异明细表

页面主体使用差异表格，默认排序建议为：

1. `变差`
2. `变好`
3. `无变化`

默认筛选建议：

- 首屏默认仅展示有变化行
- 用户可切换查看全部样本

### 4.3.4 样本详情抽屉

点击某一行后，展示样本详情抽屉，至少包含：

- 样本基础信息
- 旧值 / 新值完整对比
- 核实与质检补充字段
- 证据或说明字段
- 必要的原始上下文信息

---

## 5. 差异对比设计

## 5.1 差异展示原则

差异展示是本页核心，不允许仅返回原始对比字符串后让前端自行弱展示。

页面需要让用户一眼看出：

- 旧结果是什么
- 新结果是什么
- 是否发生变化
- 变化方向是好转还是恶化

## 5.2 对比字段映射

### 核实视角主字段

当 `regressionType = verify`：

- 主对比字段：`compare_verify_result`
- 新值补充字段：`new_verify_result`
- 次要参考字段：`compare_qc_status`、`new_qc_status`

建议处理：

- 若 `compare_verify_result` 已是 `old -> new` 组合串，则展示层拆成：
  - `primaryOldValue`
  - `primaryNewValue`
  - `primaryDiffText`
- `compare_qc_status` 作为次要参考列或抽屉字段

### 质检视角主字段

当 `regressionType = qc`：

- 主对比字段：`compare_qc_status`
- 新值补充字段：`new_qc_status`
- 次要参考字段：`compare_verify_result`、`new_verify_result`

建议处理：

- 若 `compare_qc_status` 已是 `old -> new` 组合串，则展示层拆成：
  - `primaryOldValue`
  - `primaryNewValue`
  - `primaryDiffText`
- `compare_verify_result` 作为次要参考列或抽屉字段

## 5.3 变化方向推导

建议统一补充字段：`diffDirection`

枚举：

```ts
type HitlRegressionDiffDirection = "better" | "worsen" | "same" | "unknown";
```

推导原则：

- 若底表已有可直接判断的方向字段，优先使用底表
- 若仅有旧值 / 新值对比字段，则根据业务口径补推导
- `is_consistent = true` 且主对比字段无变化时，可标记为 `same`
- 无法判断时标记为 `unknown`

## 5.4 差异高亮策略

建议前端按以下方式高亮：

- `worsen`：高优先级警示色
- `better`：正向强调色
- `same`：弱化展示
- 发生变化的字段使用对比样式突出旧值与新值

说明：

- 视觉样式不是本设计重点，但“变差优先”必须体现在排序与显著性上

---

## 6. 详情表格列设计

## 6.1 核实详情页默认列

建议默认列：

- `sampleId`
- `taskId`
- `poiName`
- `sampleType`
- `diffDirection`
- `primaryOldValue`（核实旧值）
- `primaryNewValue`（核实新值）
- `secondaryNewValue` 或核实补充信息
- `isConsistent`
- `查看详情`

其中最关键的是直接展示核实旧值 / 新值，不要只放组合串。

## 6.2 质检详情页默认列

建议默认列：

- `sampleId`
- `taskId`
- `poiName`
- `sampleType`
- `diffDirection`
- `primaryOldValue`（质检旧值）
- `primaryNewValue`（质检新值）
- `secondaryNewValue` 或质检补充信息
- `isConsistent`
- `查看详情`

## 6.3 样本详情抽屉字段

建议至少包含：

- 样本标识信息
- `compare_verify_result` 拆分展示
- `compare_qc_status` 拆分展示
- `new_verify_result`
- `new_qc_status`
- `verify_info`
- 证据相关字段
- 必要的人工标注或上下文字段

抽屉内同样需要按“旧值 / 新值 / 变化说明”组织，而不是简单分块堆原始字段。

---

## 7. 接口建议

## 7.1 主页面详情接口补充字段

现有批次详情接口建议增加：

```ts
interface HitlIterationDetail {
  overview: HitlIterationOverview;
  flow: HitlFlowStep[];
  rootCauses: HitlRootCauseItem[];
  prompts: HitlPromptItem[];
  modifications: HitlModificationItem[];
  regressionOverview: HitlIterationRegressionOverview | null;
}
```

## 7.2 回归详情接口

建议新增：

- `GET /api/hitl/iterations/:batchId/regressions/:regressionType`

查询参数：

- `datasetName`
- `runAt`

返回：

```ts
interface HitlRegressionDetailResponse {
  header: HitlRegressionHeader;
  summary: HitlRegressionSummary;
  rows: HitlRegressionDiffRow[];
}
```

## 7.3 样本详情接口

如果抽屉字段较重，建议独立接口：

- `GET /api/hitl/iterations/:batchId/regressions/:regressionType/samples/:sampleId`

返回：

- 样本基础信息
- 新旧结果完整对比字段
- 样本补充上下文

若样本详情足够轻，也可随列表一次性返回。

---

## 8. 与现有页面关系

- 主页面继续承载批次级运营概览
- 回归区从占位状态升级为真实摘要入口
- 回归详情页作为新的下钻页，与原问题详情页并列存在
- 问题详情页关注“问题样本分析”，回归详情页关注“新旧结果差异”

两类详情页的定位不同，不建议混合成同一页面。
