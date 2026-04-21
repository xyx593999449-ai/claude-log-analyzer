# 详细开发方案：HITL 问题簇分析、候选执行结果与任务级详情分析

## 1. 方案目标

本方案用于指导以下三项改造落地：

1. `iteration_overlay_drafts.overlay_draft` 从旧结构切换到 `clusters` 驱动解析
2. `iteration_skill_modifications.changes` 从旧 `summary / modified_files` 切换到新 `description / modifications / error`
3. `task_analysis_results.analysis_comment` 接入问题详情页，作为任务级分析正文

本方案坚持两个原则：

- 新结构优先、旧结构兼容
- PG / SQLite 共用同一套解析逻辑

---

## 2. 代码改造范围

后端：

- `server/repository.pg.ts`
- `server/repository.ts`
- `server/types.ts`
- 建议新增共享解析模块：
  - `server/hitlOverlayParser.ts`
  - `server/hitlModificationParser.ts`

前端：

- `src/lib/dashboardTypes.ts`
- `src/components/dashboard/HITLIterationPage.tsx`
- `src/components/dashboard/HITLIssueDetailPage.tsx`

文档：

- `doc/v4_hitl_backend_adaptation/`
- `README.md`
- `CHANGELOG.md`

---

## 3. 数据解析设计

## 3.1 Overlay 新结构解析

### 3.1.1 原始结构

输入来源：

- `iteration_overlay_drafts.overlay_draft`
- `iteration_overlay_drafts.tag_distribution`
- `iteration_overlay_drafts.prompts`
- `iteration_overlay_drafts.prompt_paths`

### 3.1.2 建议新增原始解析类型

```ts
interface HitlOverlayClusterRaw {
  cluster_id?: unknown;
  description?: unknown;
  severity?: unknown;
  frequency?: unknown;
  tags?: {
    issue_observations?: unknown;
    judgment_dimensions?: unknown;
  };
  representative_cases?: unknown;
  modifications?: unknown;
}

interface HitlOverlayModificationRaw {
  action?: unknown;
  description?: unknown;
  before?: unknown;
  after?: unknown;
  target_file?: unknown;
  target_skill?: unknown;
  expected_effect?: unknown;
}
```

### 3.1.3 解析模块职责

建议新增共享方法：

- `parseOverlayClusters()`
- `buildOverlaySummaryFromClusters()`
- `buildRootCausesFromClusters()`
- `buildOverlayInsightFromClusters()`

### 3.1.4 兼容顺序

1. 若存在 `overlay_draft.clusters`
   - 走新结构
2. 否则
   - 回退旧结构：
     - `issue_distribution`
     - `learnable_patterns`
     - `skill_impact`
     - `summary`

---

## 3.2 Modification 新结构解析

### 3.2.1 原始结构

输入来源：

- `iteration_skill_modifications.changes`
- 行级字段：
  - `target_skill`
  - `modified_file`
  - `status`
  - `created_at`

### 3.2.2 建议新增原始解析类型

```ts
interface HitlAppliedModificationRaw {
  action?: unknown;
  cluster_id?: unknown;
  description?: unknown;
  target_file?: unknown;
  target_skill?: unknown;
  expected_effect?: unknown;
}

interface HitlModificationChangesRaw {
  description?: unknown;
  modifications?: unknown;
  error?: unknown;
}
```

### 3.2.3 解析模块职责

建议新增共享方法：

- `parseModificationChanges()`
- `buildModificationItemFromRow()`

### 3.2.4 兼容顺序

1. 若存在 `changes.description / changes.modifications / changes.error`
   - 走新结构
2. 否则
   - 回退旧结构：
     - `summary`
     - `modified_files`
     - `root_causes_addressed`

---

## 3.3 Task Analysis 新结构解析

### 3.3.1 数据来源

- `task_analysis_results`

### 3.3.2 本轮重点消费字段

- `analysis_comment`
- `overall_verdict`
- `created_at`

### 3.3.3 解析模块职责

建议新增：

- `formatTaskAnalysisComment()`
- `splitTaskAnalysisBlocks()`

### 3.3.4 格式化目标

后端负责：

- 清理空白与 `NaN`
- 保留原语义
- 将长文本拆成适合展示的段落数组

---

## 4. 仓储层改造方案

## 4.1 PG 仓储

### 4.1.1 表候选新增

在 `getHitlTableNames()` 中新增：

- `taskAnalysis`
  - `public.task_analysis_results`
  - `task_analysis_results`

### 4.1.2 列表接口

方法：

- `getHitlIterations()`

改造点：

- `summary` 改为调用 `buildOverlaySummaryFromClusters()`
- 若新结构不存在，再回退旧 `summary`

### 4.1.3 详情接口

方法：

- `getHitlIterationDetail()`

改造点：

- `rootCauses` 改为由 `clusters` 派生
- `overlayInsight` 改为由 `clusters` 聚合
- `modifications` 改为读取新 `changes` 结构

### 4.1.4 问题任务详情接口

方法：

- `getHitlIssueTaskDetail()`

改造点：

- 通过 `task_id` 读取 `task_analysis_results`
- 返回新增 `taskAnalysis` 字段
- `modelAnalysis` 继续保留批次级问题簇与 prompt 信息

---

## 4.2 SQLite 仓储

### 4.2.1 mock 表补齐

确保 SQLite mock 中存在：

- `task_analysis_results`

### 4.2.2 样例导入

新增或补齐：

- `example/hitl/example/public.task_analysis_result.txt`

### 4.2.3 解析逻辑

严格与 PG 仓储共用同一套 parser，禁止在 SQLite 中单独实现另一套业务口径。

---

## 5. DTO 与类型设计

## 5.1 `HitlRootCauseItem`

建议扩展：

```ts
clusterId?: string | null;
severity?: string | null;
judgmentDimensions?: string[];
representativeCases?: string[];
```

## 5.2 `HitlModificationItem`

建议扩展：

```ts
clusterIds?: string[];
errorMessage?: string | null;
modifications?: Array<{
  action: string | null;
  clusterId: string | null;
  description: string | null;
  targetFile: string | null;
  targetSkill: string | null;
  expectedEffect: string | null;
}>;
```

## 5.3 `HitlIssueTaskDetail`

建议新增：

```ts
taskAnalysis?: {
  analysisComment: string | null;
  analysisCommentBlocks: string[];
  overallVerdict: string | null;
  createdAt: string | null;
};
```

### 5.3.1 设计原则

- `modelAnalysis` 保留批次级问题簇分析
- `taskAnalysis` 承载任务级正文分析
- 两者并列，避免混淆语义

---

## 6. 页面改造方案

## 6.1 `HITLIterationPage`

### 6.1.1 问题分析区

展示内容调整为：

- 问题标签
- 数量（`frequency`）
- 关联 skill
- cluster 摘要
- 可选展示 `severity`

### 6.1.2 可学习模式区

保留现有区块，但改由 `clusters` 派生：

- `issueType`
- `pattern = description`
- `count = frequency`

### 6.1.3 迭代建议区

每个 skill 分组下新增“结构化建议项”展示：

- `action`
- `description`
- `before`
- `after`
- `target_file`
- `expected_effect`

### 6.1.4 候选版本区

每条候选记录展示：

- `targetSkill`
- `status`
- `changeSummary`
- `modifiedFiles`
- `clusterIds`

失败记录额外展示：

- `errorMessage`

---

## 6.2 `HITLIssueDetailPage`

### 6.2.1 当前问题

当前页面中的“模型分析结果”仍为预留态，且提示文案表明尚未接入独立结果表。

### 6.2.2 改造方案

将页面下半部分拆成两块语义：

1. `问题簇分析与 Prompt 建议`
2. `任务级分析结论`

### 6.2.3 任务级分析结论区展示

重点展示：

- `overallVerdict`
- `analysisCommentBlocks`
- `createdAt`

不再把 `task_analysis_results` 做成字段表平铺。

### 6.2.4 UI 形式建议

- 顶部状态标签：`overallVerdict`
- 中部正文卡片：按段展示 `analysisCommentBlocks`
- 底部时间辅助信息：`createdAt`

---

## 7. Prompt 关联策略

## 7.1 新规则

问题详情页中与某个问题类型相关的 prompt，不再优先依赖旧 `issue_distribution[].step`，改为：

1. 在命中的 cluster 中取 `modifications[].target_skill`
2. 再按 `target_skill` 匹配 prompt
3. 若匹配不到，再回退按 `issueType` 文本包含过滤

## 7.2 原因

新结构中 `target_skill` 已明确给出，与 prompt 分组语义更一致。

---

## 8. 文本格式化策略

## 8.1 `analysis_comment`

后端负责：

1. 清洗 `NaN`
2. 统一换行
3. 切分段落
4. 保留原语义，不做压缩总结

## 8.2 长文本展示

前端负责：

- 默认展示完整分段正文
- 不再把正文压成单行字段值

---

## 9. 开发顺序

### 第一步：类型与 parser

- 新增 overlay parser
- 新增 modification parser
- 新增 task analysis formatter
- 扩展前后端类型定义

### 第二步：仓储接入

- PG 仓储接入三类新结构解析
- SQLite 仓储同步接入

### 第三步：主页面

- 批次列表摘要
- 问题分析区
- 迭代建议区
- 候选版本区

### 第四步：问题详情页

- 接入 `task_analysis_results`
- 调整模型分析区语义

### 第五步：验证

- 新结构样例验证
- 历史旧结构回归验证
- SQLite / PG 双环境联调

---

## 10. 风险与处理

## 10.1 新旧结构并存

风险：

- 历史批次仍是旧结构
- 新批次是新结构

处理：

- 新结构优先
- 旧结构兜底

## 10.2 `steps` 数据不稳定

风险：

- 当前样例中 `steps` 多为空

处理：

- 本轮不把 `steps` 作为主展示核心
- 后续单独评估是否做步骤时间线

## 10.3 结构化建议过多导致页面过重

风险：

- 一个批次下 cluster 与 modification 数量较多

处理：

- 主页面默认展示摘要
- 长内容折叠
- 细节通过展开查看

---

## 11. 验收清单

1. 新样例 `overlay_draft.clusters` 能生成批次摘要
2. 新样例 `clusters[]` 能生成问题分析卡片
3. 新样例 `clusters[].modifications[]` 能展示在迭代建议区
4. 新样例 `changes.description / modifications / error` 能驱动候选版本区
5. 新增 `task_analysis_results.analysis_comment` 能显示在问题详情页
6. 失败执行记录能显示错误信息
7. 历史旧结构批次仍能正常展示
