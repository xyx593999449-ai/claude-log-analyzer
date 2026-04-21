# Claude Log Analyzer 正式环境 PG 依赖表与规格清单

## 1. 文档目的

本文用于梳理当前 `claude-log-analyzer` 在 PostgreSQL 正式环境下实际依赖的表 / 视图、用途、读写方向与代码真实使用字段，便于后续：

- 联调时快速确认缺表、缺列或字段语义漂移
- 切表或扩字段时评估影响面
- 交接时明确“哪些字段是当前代码真正在读写的”

说明：

- 本文按当前仓库 `server/repository.pg.ts` 与 `server/importers/hitlBatchCsv.ts` 的实现整理
- “规格”优先记录当前代码依赖子集，不等同于数据库全量 DDL
- 若某张表存在候选回退顺序，会明确写出当前优先级

---

## 2. 依赖总览

| 类别 | 表 / 视图 | 角色 | 当前用途 |
|---|---|---|---|
| 业务主表 | `poi_init` | 读取 | 任务主数据、批次归组、任务列表主索引 |
| 业务结果表 | `poi_verified` | 读取 | 核实结果、核实时间、自动化率统计 |
| 业务结果表 | `poi_qc` | 读取 | 质检结果、质检时间、质量指标统计 |
| 运行分析表 | `poi_task_analysis` | 读写 | 流程运行态、耗时 / Token / session 汇总 |
| 导入批次表 | `analysis_imports` | 读取 | 最近一次导入快照展示 |
| 原始日志表 | `public.poi_claude_log` | 读取 | 任务级 Claude 原始日志详情 |
| HITL 负样本主表 | `public.t_poi_key_property_check_result_ext` | `select / insert` | HITL 人工反馈结果池主表、CSV 导入目标表 |
| HITL 迭代分析表 | `public.iteration_overlay_drafts` | 读取 | 根因分析、Prompt、批次总结 |
| HITL Skill 改造表 | `public.iteration_skill_modifications` | 读取 | 技能改动摘要、文件、状态 |
| 回归样本表 | `public.poi_verified_regression_test` | 读取 | 回归样本明细 |
| 回归对比表 | `public.poi_verified_regression_test_compare` | 读取 | 新旧结果对比、差异方向 |
| 回归结果汇总表 | `public.poi_verified_regression_test_result` | 读取 | 回归批次级摘要指标 |

---

## 3. 候选顺序与主口径

### 3.1 HITL 负样本表候选顺序

当前正式环境对负样本主表的解析顺序应为：

1. `public.t_poi_key_property_check_result_ext`
2. `t_poi_key_property_check_result_ext`

结论：

- 正式环境当前主口径应优先保障 `public.t_poi_key_property_check_result_ext`
- `public.v_hitl_negative_samples`
- `public.iteration_negative_samples`
- `public.iteration_negative_samples_0415_bak`
- 以上对象均为旧开发遗留，不纳入正式环境必需对象清单

### 3.2 其他 HITL 表候选顺序

`iteration_overlay_drafts`：

1. `public.iteration_overlay_drafts`
2. `iteration_overlay_drafts`

`iteration_skill_modifications`：

1. `public.iteration_skill_modifications`
2. `iteration_skill_modifications`

回归三表：

- `public.poi_verified_regression_test`
- `public.poi_verified_regression_test_compare`
- `public.poi_verified_regression_test_result`

若 `public.` 版本不存在，代码会继续尝试无 schema 名版本。

---

## 4. 业务主链路依赖

### 4.1 `poi_init`

角色：

- 任务主数据入口
- 任务列表主索引
- 批次统计与趋势图的任务全集基表

当前代码实际读取字段：

- `task_id`
- `id`
- `name`
- `city`
- `address`
- `poi_type`
- `verify_status`
- `updatetime`

主要使用位置：

- 过滤项、总览大盘、任务列表、任务详情、批次概览

依赖说明：

- `task_id` 是多数联表的主键
- `updatetime` 参与总览统计时间口径与任务排序回退
- `verify_status` 在总览与任务列表里作为初始状态回退值使用

### 4.2 `poi_verified`

角色：

- 核实结果事实表

当前代码实际读取字段：

- `task_id`
- `verify_status`
- `verify_result`
- `overall_confidence`
- `verify_time`

主要使用位置：

- 总览自动化率
- 任务列表核实区
- 批次概览
- 日志详情业务时间

依赖说明：

- 自动化率按 `verify_result != '需人工核实'` 计算
- `verify_time` 是核实阶段的业务时间主口径

### 4.3 `poi_qc`

角色：

- 质检结果事实表

当前代码实际读取字段：

- `task_id`
- `qc_status`
- `quality_status`
- `is_manual_required`
- `qc_score`
- `has_risk`
- `is_qualified`
- `qc_time`

主要使用位置：

- 质检状态筛选
- 总览质检合格率
- 任务列表质检区
- 批次概览
- 日志详情业务时间

依赖说明：

- 列表与筛选会同时兼容 `quality_status` 和 `qc_status`
- 质检合格率按 `is_qualified = 1` 统计

---

## 5. 运行态与日志依赖

### 5.1 `poi_task_analysis`

角色：

- 运行分析聚合表
- 当前服务会在 `ensureSchema()` 中自动建表

读写方向：

- 读取：总览、任务列表、任务详情、批次概览
- 写入：导入分析链路会写入运行聚合结果

当前代码依赖字段：

- `id`
- `import_batch_id`
- `phase`
- `task_id`
- `row_number`
- `worker_id`
- `batch_id`
- `status`
- `started_at`
- `ended_at`
- `duration_ms`
- `attempt_count`
- `retry_count`
- `session_count`
- `session_ids_json`
- `total_input_tokens`
- `total_output_tokens`
- `total_cache_tokens`
- `total_cost_usd`
- `total_model_duration_ms`
- `total_tool_calls`
- `total_tool_errors`
- `error_summary`
- `raw_details_json`
- `created_at`

索引：

- `idx_temp_task_task_phase (task_id, phase)`
- `idx_temp_task_batch (import_batch_id)`

依赖说明：

- 多数查询都会先按 `task_id + phase` 取最新一条运行记录
- `started_at / ended_at` 是运行时间口径的核心字段
- `session_ids_json` 与 `poi_claude_log.session_id` 联动，用于拼装任务日志

### 5.2 `analysis_imports`

角色：

- 导入批次快照表

读写方向：

- 读取：总览页最近一次导入快照
- 写入：导入分析链路会写入

当前代码依赖字段：

- `import_batch_id`
- `source`
- `verify_executor_log`
- `verify_claude_log`
- `qc_executor_log`
- `qc_claude_log`
- `verify_task_count`
- `qc_task_count`
- `total_task_runs`
- `created_at`

依赖说明：

- 当前前端主要只消费 `source / verify_task_count / qc_task_count / total_task_runs / created_at`
- `verify_claude_log / qc_claude_log` 属于历史兜底字段，当前主日志读取链路已切到 `poi_claude_log`

### 5.3 `public.poi_claude_log`

角色：

- Claude 原始日志事实表

读写方向：

- 读取：任务日志详情页

当前代码依赖字段：

- `task_id`
- `session_id`
- `log_detail`
- `updatetime`

主键：

- `(task_id, session_id)`

依赖说明：

- 代码按 `task_id` 拉全量日志，再用 `poi_task_analysis.session_ids_json` 过滤出核实 / 质检两个阶段各自的日志片段
- `log_detail` 兼容 JSON 数组、JSON 字符串和普通字符串三种形态

---

## 6. HITL 人工反馈结果池依赖

### 6.1 `public.t_poi_key_property_check_result_ext`

角色：

- HITL 人工反馈结果池主表
- 当前 CSV 导入能力的唯一目标表

导入器常量：

- `server/importers/hitlBatchCsv.ts`
- `HITL_IMPORT_TARGET_TABLE = "public.t_poi_key_property_check_result_ext"`

当前代码读取字段：

- `id`
- `task_id`
- `batch_id`
- `name_chn`
- `addr_chn`
- `city`
- `poi_type`
- `verify_result`
- `verify_info`
- `evidence_record`
- `qc_status`
- `qc_result`
- `create_time`
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
- `verified_address`
- `verified_poi_type`
- `verified_city_adcode`

当前导入 / schema 自愈相关字段：

- `batch_id`
- `verify_info`

当前代码写入方式：

- 通过批量导入接口向该表执行纯 `insert`
- 服务启动时会自动执行：
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS batch_id varchar(255)`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS verify_info jsonb`
  - `CREATE INDEX IF NOT EXISTS idx_t_poi_key_property_check_result_ext_batch_id ON ... (batch_id)`

正式环境写入边界：

- 该表只允许 `select`
- 该表只允许 `insert`
- 严禁对原表执行 `update`
- 严禁对原表执行 `delete`

### 6.2 新表直连时的兼容映射

当代码直接命中 `t_poi_key_property_check_result_ext` 时，会在仓储层把它归一化成旧 HITL 页面可消费的字段集：

| 页面侧字段 | 新表来源 |
|---|---|
| `task_id` | `task_id` |
| `id` | `id` |
| `batch_id` | `batch_id` |
| `name` | `name_chn` |
| `address` | `addr_chn` |
| `city` | `city` |
| `poi_type` | `poi_type` |
| `verify_result` | `verify_result` |
| `verify_info` | `verify_info::text` |
| `evidence_record` | `evidence_record::text` |
| `quality_status` | `qc_status` |
| `qc_status` | `qc_status` |
| `qc_result` | `qc_result::text` |
| `qc_score` | `qc_result ->> 'qc_score'` |
| `has_risk` | `qc_result ->> 'has_risk'` |
| `is_qualified` | `qc_result -> 'statistics_flags' ->> 'is_qualified'` |
| `is_manual_required` | `qc_result -> 'statistics_flags' ->> 'is_manual_required'` |
| `updatetime` | `create_time::text` |
| `qc_time` | 固定 `NULL` |
| `verified_addr` | `verified_address` |

说明：

- 当前前端已不再依赖 `qc_time` 展示
- `quality_status` 当前产品口径等价回退为 `qc_status`
- `qc_score / has_risk / is_qualified / is_manual_required` 均以 `qc_result` 派生为准

### 6.3 CSV 导入规格摘要

上传前提：

- 文件格式必须为 `csv`
- 编码必须为 `UTF-8` 且无 `BOM`
- `batch_id` 由人工输入，必填，且全局不可重复

导入表列子集：

- 导入器支持的字段清单以 `hitlBatchCsv.ts` 中 `HITL_IMPORT_COLUMNS` 为准
- CSV 中不允许直接携带 `batch_id` 列，`batch_id` 由页面输入后统一回填写库

当前最关键必填字段：

- `id`
- `task_id`
- `manual_comment`

---

## 7. HITL 兼容回退链路

正式环境约束：

- `public.v_hitl_negative_samples`
- `public.iteration_negative_samples`
- `public.iteration_negative_samples_0415_bak`

以上对象都属于旧开发遗留表 / 视图：

- 不属于正式环境依赖
- 不应进入正式环境 PG 候选读取链路
- 当前正式环境负样本链路只应读取 `public.t_poi_key_property_check_result_ext`

---

## 8. HITL 迭代分析与改造依赖

### 8.1 `public.iteration_overlay_drafts`

角色：

- 批次级根因分析与 Prompt 聚合表

当前代码依赖字段：

- `batch_id`
- `overlay_draft`
- `prompt_paths`
- `prompts`

依赖说明：

- `overlay_draft` 会被解析出：
  - `summary`
  - `root_cause_analysis`
  - `issue_distribution`
  - `learnable_patterns`
  - `skill_impact`
- `prompt_paths` 需兼容 JSON 数组和 PG 数组字面量

### 8.2 `public.iteration_skill_modifications`

角色：

- 批次级 Skill 改造结果表

当前代码依赖字段：

- `batch_id`
- `target_skill`
- `modified_file`
- `changes`
- `status`
- `created_at`

依赖说明：

- `changes` 会被解析为 JSON，并优先读取：
  - `summary`
  - `modified_files`

### 8.3 正式环境约束

- 正式环境只保留 `public.iteration_overlay_drafts`
- 正式环境只保留 `public.iteration_skill_modifications`
- 带后缀备份表不纳入正式环境依赖范围

---

## 9. 回归验证依赖

### 9.1 `public.poi_verified_regression_test_result`

角色：

- 回归批次级摘要结果表

当前代码依赖字段：

- `batch_id`
- `dataset_name`
- `updatetime`
- `timestamp_suffix`
- `total_count`
- `positive_count`
- `negative_count`
- `verify_better_ratio`
- `verify_worsen_ratio`
- `qc_better_ratio`
- `qc_worsen_ratio`

用途：

- 回归运行列表
- 回归摘要卡
- 发布决策区

### 9.2 `public.poi_verified_regression_test_compare`

角色：

- 新旧结果差异对比表

当前代码依赖字段：

- `batch_id`
- `dataset_name`
- `timestamp_suffix`
- `id`
- `task_id`
- `sample_type`
- `is_consistent`
- `compare_verify_result`
- `new_verify_result`
- `compare_qc_status`
- `new_qc_status`
- `compare_name`
- `compare_address`
- `compare_poi_type`
- `compare_city`
- `compare_city_adcode`
- `compare_status`

用途：

- 回归详情差异列表
- 样本详情页新旧字段对比

### 9.3 `public.poi_verified_regression_test`

角色：

- 回归样本事实表

当前代码依赖字段：

- `batch_id`
- `dataset_name`
- `timestamp_suffix`
- `id`
- `task_id`
- `sample_type`
- `name`
- `address`
- `city`
- `poi_type`
- `status`
- `true_name`
- `true_address`
- `true_city`
- `true_poi_type`
- `true_city_adcode`
- `true_status`
- `cur_verify_result`
- `cur_qc_status`
- `verified_name`
- `verified_address`
- `verified_city`
- `verified_poi_type`
- `verified_city_adcode`
- `verified_status`
- `verified_verify_result`
- `verify_info`
- `evidence_record`

用途：

- 回归样本详情页
- 真值 / 当前结果 / 核实结果对照展示

---

## 10. 当前最需要保障的正式环境约束

### 10.1 必保字段

若以下字段缺失，会直接影响当前页面主链路：

- `poi_init.task_id`
- `poi_verified.task_id`
- `poi_qc.task_id`
- `poi_task_analysis.task_id`
- `public.poi_claude_log.task_id`
- `public.t_poi_key_property_check_result_ext.batch_id`
- `public.t_poi_key_property_check_result_ext.verify_info`
- `public.iteration_overlay_drafts.batch_id`
- `public.iteration_skill_modifications.batch_id`
- `public.poi_verified_regression_test_result.batch_id`

### 10.2 语义敏感字段

若字段仍存在但语义变化，也会导致页面展示失真：

- `poi_verified.verify_result`
- `poi_qc.qc_status`
- `poi_qc.quality_status`
- `poi_qc.is_qualified`
- `t_poi_key_property_check_result_ext.qc_result`
- `t_poi_key_property_check_result_ext.create_time`
- `iteration_overlay_drafts.overlay_draft`
- `iteration_skill_modifications.changes`

---

## 11. 结论

当前正式环境 PostgreSQL 依赖可以归纳为三层：

1. 业务主链路：`poi_init / poi_verified / poi_qc`
2. 运行与日志链路：`poi_task_analysis / analysis_imports / public.poi_claude_log`
3. HITL 与回归链路：`t_poi_key_property_check_result_ext + overlay/modification/regression_*`

其中最关键的正式环境主表已明确为：

- `public.t_poi_key_property_check_result_ext`

当前代码也已经按此表优先读取，并在仓储层承担旧字段兼容映射；后续如果再调整正式库结构，应优先检查本文第 6 节与第 10 节列出的字段与语义约束，并持续保证该表不引入 `update / delete` 依赖。

---

## 12. 正式环境表字段规格附录

说明：

- 本节按当前仓库可获取的 DDL 来源整理
- 业务主链路表优先以 `example/db_conf/tables_ddl.sql` 为准
- HITL / 回归链路优先以 `example/hitl/ddl/` 为准
- 若某列暂无单独注释，统一标记为 `-`
- `public.t_poi_key_property_check_result_ext` 当前正式环境以 `_0416` DDL 为基础，同时叠加已确认的 `batch_id / verify_info` 字段

### 12.1 `poi_init`

来源：

- `example/db_conf/tables_ddl.sql`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `x_coord` | `real` | - | 经度 |
| `y_coord` | `real` | - | 纬度 |
| `status` | `integer` | - | 初始状态 |
| `updatetime` | `timestamp without time zone` | - | 更新时间 |
| `task_id` | `text not null` | - | 任务主键 |
| `city` | `text` | - | 城市 |
| `city_adcode` | `text` | - | 城市编码 |
| `verify_status` | `character varying` | - | 初始核实状态 |
| `verify_priority` | `character varying` | - | 核实优先级 |
| `address` | `text` | - | 地址 |
| `id` | `text not null` | - | POI ID |
| `name` | `text not null` | - | POI 名称 |
| `poi_type` | `text` | - | POI 类型 |

### 12.2 `poi_verified`

来源：

- `example/db_conf/tables_ddl.sql`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `y_coord` | `real` | - | 纬度 |
| `verify_info` | `jsonb` | - | 核实详情 |
| `evidence_record` | `jsonb` | - | 证据记录 |
| `changes_made` | `jsonb` | - | 变更详情 |
| `overall_confidence` | `real` | - | 总置信度 |
| `verify_time` | `timestamp without time zone` | - | 核实时间 |
| `updatetime` | `timestamp without time zone` | - | 更新时间 |
| `poi_status` | `integer` | - | POI 状态 |
| `x_coord` | `real` | - | 经度 |
| `original_task_id` | `text` | - | 原始任务 ID |
| `original_id` | `text` | - | 原始 ID |
| `verification_notes` | `text` | - | 核实备注 |
| `verified_by` | `character varying` | - | 核实人 |
| `task_id` | `text not null` | - | 任务主键 |
| `verification_version` | `character varying` | - | 核实版本 |
| `id` | `text not null` | - | POI ID |
| `name` | `text not null` | - | 名称 |
| `poi_type` | `text` | - | 类型 |
| `address` | `text` | - | 地址 |
| `city` | `text` | - | 城市 |
| `city_adcode` | `text` | - | 城市编码 |
| `verify_status` | `character varying not null` | - | 核实状态 |
| `verify_result` | `character varying not null` | - | 核实结论 |

### 12.3 `poi_qc`

来源：

- `example/db_conf/tables_ddl.sql`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `evidence_record` | `jsonb` | - | 证据记录 |
| `x_coord` | `real` | - | 经度 |
| `y_coord` | `real` | - | 纬度 |
| `poi_status` | `integer` | - | POI 状态 |
| `qc_score` | `integer` | - | 质检分 |
| `qc_result` | `jsonb` | - | 质检结果详情 |
| `is_qualified` | `integer` | - | 是否合格 |
| `has_risk` | `integer` | - | 是否有风险 |
| `is_auto_approvable` | `integer` | - | 是否可自动通过 |
| `is_manual_required` | `integer` | - | 是否需人工 |
| `is_downgrade_consistent` | `integer` | - | 降级是否一致 |
| `qc_time` | `timestamp without time zone` | - | 质检时间 |
| `updatetime` | `timestamp without time zone` | - | 更新时间 |
| `verify_info` | `jsonb` | - | 核实详情 |
| `downgrade_issue_type` | `character varying` | - | 降级问题类型 |
| `downgrade_status` | `character varying` | - | 降级状态 |
| `qc_by` | `character varying` | - | 质检人 |
| `id` | `character varying` | - | POI ID |
| `batch_id` | `character varying` | - | 批次 ID |
| `name` | `character varying` | - | 名称 |
| `original_task_id` | `character varying` | - | 原始任务 ID |
| `qc_version` | `character varying` | - | 质检版本 |
| `poi_type` | `character varying` | - | 类型 |
| `address` | `character varying` | - | 地址 |
| `city` | `character varying` | - | 城市 |
| `city_adcode` | `character varying` | - | 城市编码 |
| `task_id` | `character varying not null` | - | 任务主键 |
| `verify_result` | `character varying` | - | 核实结论 |
| `quality_status` | `character varying` | - | 质量状态 |
| `qc_status` | `character varying` | - | 质检状态 |

### 12.4 `poi_task_analysis`

来源：

- `server/repository.pg.ts ensureSchema()`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `id` | `bigserial primary key` | - | 自增主键 |
| `import_batch_id` | `text not null` | - | 导入批次 ID |
| `phase` | `text not null` | - | 阶段，如 `verify` / `qc` |
| `task_id` | `text not null` | - | 任务 ID |
| `row_number` | `integer` | - | 原始行号 |
| `worker_id` | `text` | - | Worker ID |
| `batch_id` | `text` | - | 业务批次 ID |
| `status` | `text` | - | 运行状态 |
| `started_at` | `text` | - | 开始时间 |
| `ended_at` | `text` | - | 结束时间 |
| `duration_ms` | `integer default 0` | - | 耗时毫秒 |
| `attempt_count` | `integer default 0` | - | 尝试次数 |
| `retry_count` | `integer default 0` | - | 重试次数 |
| `session_count` | `integer default 0` | - | session 数 |
| `session_ids_json` | `text` | - | session ID 列表 JSON |
| `total_input_tokens` | `bigint default 0` | - | 输入 Token |
| `total_output_tokens` | `bigint default 0` | - | 输出 Token |
| `total_cache_tokens` | `bigint default 0` | - | 缓存 Token |
| `total_cost_usd` | `double precision default 0` | - | 总成本 |
| `total_model_duration_ms` | `bigint default 0` | - | 模型耗时 |
| `total_tool_calls` | `bigint default 0` | - | 工具调用次数 |
| `total_tool_errors` | `bigint default 0` | - | 工具错误次数 |
| `error_summary` | `text` | - | 错误摘要 |
| `raw_details_json` | `text` | - | 原始详情 JSON |
| `created_at` | `text not null` | - | 创建时间 |

### 12.5 `analysis_imports`

来源：

- `server/repository.pg.ts ensureSchema()`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `import_batch_id` | `text primary key` | - | 导入批次 ID |
| `source` | `text not null` | - | 导入来源 |
| `verify_executor_log` | `text` | - | 核实执行日志 |
| `verify_claude_log` | `text` | - | 核实 Claude 日志 |
| `qc_executor_log` | `text` | - | 质检执行日志 |
| `qc_claude_log` | `text` | - | 质检 Claude 日志 |
| `verify_task_count` | `integer default 0` | - | 核实任务数 |
| `qc_task_count` | `integer default 0` | - | 质检任务数 |
| `total_task_runs` | `integer default 0` | - | 总运行数 |
| `created_at` | `text not null` | - | 创建时间 |

### 12.6 `public.poi_claude_log`

来源：

- `server/repository.pg.ts ensureSchema()`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `task_id` | `varchar not null` | - | 任务 ID |
| `session_id` | `varchar not null` | - | Session ID |
| `log_detail` | `jsonb null` | - | 原始日志详情 |
| `updatetime` | `timestamp null` | - | 更新时间 |

主键：

- `(task_id, session_id)`

### 12.7 `public.t_poi_key_property_check_result_ext`

来源：

- `example/hitl/ddl/public.t_poi_key_property_check_result_ext_0416.txt`
- 正式环境增量约束：`batch_id`、`verify_info`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `id` | `varchar(255) not null` | - | 主键 |
| `guid` | `varchar(255)` | `poi数据的id` | |
| `pid` | `int4` | `组,同pid为一组任务` | |
| `name_chn` | `varchar(255)` | `poi名称` | |
| `poi_type` | `varchar(255)` | `类型` | |
| `addr_chn` | `varchar(255)` | `地址` | |
| `x_coord` | `float8` | `经度` | |
| `y_coord` | `float8` | `纬度` | |
| `poi_id` | `varchar(255)` | `源id` | |
| `adcode` | `varchar(255)` | `行政区编码` | |
| `data_src` | `varchar(255)` | `数据来源` | |
| `aoi_guid` | `varchar(255)` | `aoi 的id` | |
| `building_guid` | `varchar(255)` | `楼栋的id` | |
| `exttype` | `varchar(255)` | `来源类型` | |
| `alive` | `varchar(255)` | `在线状态` | |
| `alias` | `varchar(1000)` | `别名` | |
| `short_name` | `varchar(255)` | `简称` | |
| `pc_type` | `varchar(255)` | `空间属性` | |
| `status` | `varchar(2)` | `数据核实状态；1:数据无误,2:修改属性,3:无法核实,4:过期下线,5:非任务数据` | |
| `version` | `int4` | `版本号` | DDL 原字段为 `"version"` |
| `task_check_id` | `varchar(64)` | `与业务表t_sub_task_acf表关联id` | |
| `picture_path` | `varchar(1000)` | `图片路径` | |
| `remark` | `text` | `脚本给的备注信息` | |
| `main_task_id` | `varchar(255)` | `批次任务Id` | |
| `create_time` | `timestamp default current_timestamp` | `创建时间` | |
| `create_by` | `varchar(255)` | `创建人` | |
| `ng_attribute` | `varchar(100)` | `内检,质检不通过的属性` | |
| `package_id` | `int8` | `任务包ID` | |
| `save_count` | `int4` | `暂存次数` | |
| `judge_result` | `varchar(32)` | `仲裁结果` | |
| `worker_remark_id` | `varchar(64)` | `作业备注ID` | |
| `extra_info` | `text` | `扩展信息` | |
| `task_id` | `varchar(255)` | `唯一任务标识` | |
| `verify_result` | `varchar(64)` | `核实数字员工原始结论,核实通过/需人工核实` | |
| `verify_info` | `jsonb` | `-` | 正式环境补充字段 |
| `evidence_record` | `jsonb` | `证据列表` | |
| `qc_status` | `varchar(64)` | `质检数字员工原始结论,qualified/risky/unqualified` | |
| `qc_result` | `jsonb` | `质检数字员工结果详情` | |
| `old_name` | `varchar(255)` | `原始名称` | |
| `old_x_coord` | `float8` | `原始经度` | |
| `old_y_coord` | `float8` | `原始纬度` | |
| `old_poi_type` | `varchar(255)` | `原始类型` | |
| `old_address` | `varchar(255)` | `原始地址` | |
| `city` | `varchar(255)` | `城市` | |
| `old_city` | `varchar(255)` | `原始城市` | |
| `old_city_adcode` | `varchar(255)` | `原始adcode` | |
| `verify_content_is_correct` | `varchar(100)` | `核实对名称、地址、类型、行政区划、坐标等核实的最终结果是否正确；1：是，0：否` | |
| `verify_action_is_correct` | `varchar(100)` | `核实给出的动作（核实通过/需人工核实）是否合理，1：是，0：否` | |
| `qc_intercept_is_correct` | `varchar(100)` | `质检这次是否应该把数据拦截至人工，1：是，0：否` | |
| `evidence_status` | `varchar(100)` | `当前证据是否足够支撑结论，1：是，0：否，2：矛盾` | |
| `issue_observation_tags` | `varchar(255)` | `标记作业员直接观察到的证据问题；多选时建议用英文逗号分隔` | 取值见原 DDL 注释 |
| `judgment_dimension_tags` | `varchar(255)` | `标记问题主要出在哪个判断维度；建议最多选2个；多选时建议用英文逗号分隔` | 取值见原 DDL 注释 |
| `manual_comment` | `text` | `必填；说明为什么这么判、关键问题是什么、关键依据是什么` | |
| `conflicting_evidence` | `text` | `当 evidence_status = conflicting 时建议填写；写明哪些证据互相冲突` | |
| `manual_added_evidence_url` | `text` | `写明缺失的重要证据的链接` | |
| `manual_added_evidence_type` | `text` | `人工复核时补充的关键证据类型` | |
| `manual_added_evidence_abstract` | `text` | `人工复核时补充的关键证据内容摘要，比如核实到拆迁下线的内容` | |
| `write_status` | `varchar(100) default '0'` | `是否回成果库，1是，0否` | |
| `poi_status` | `varchar(100)` | `POI状态` | |
| `old_poi_status` | `varchar(100)` | `原始POI状态` | |
| `verified_name` | `varchar(255)` | `核实后名称` | |
| `verified_x_coord` | `float8` | `核实后经度` | |
| `verified_y_coord` | `float8` | `核实后纬度` | |
| `verified_poi_type` | `varchar(255)` | `核实后类型` | |
| `verified_address` | `varchar(255)` | `核实后地址` | |
| `verified_city` | `varchar(255)` | `核实后城市` | |
| `verified_city_adcode` | `varchar(255)` | `核实后adcode` | |
| `verified_poi_status` | `varchar(100)` | `核实后POI状态` | |
| `batch_id` | `varchar(255)` | `-` | 正式环境补充字段，批次 ID |

索引：

- 主键：`(id)`
- `t_poi_key_property_check_result_ext_guid_idx`
- `t_poi_key_property_check_result_ext_package_id_idx`
- `t_poi_key_property_check_result_ext_task_check_id_idx`
- `idx_t_poi_key_property_check_result_ext_batch_id`

### 12.8 `public.iteration_overlay_drafts`

来源：

- `example/hitl/ddl/public.iteration_overlay_drafts.txt`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `batch_id` | `text not null` | - | 主键 |
| `overlay_draft` | `jsonb not null` | - | 迭代分析草稿 |
| `tag_distribution` | `jsonb` | - | 标签分布 |
| `prompt_paths` | `_text` | - | Prompt 路径数组 |
| `prompts` | `jsonb` | - | Prompt 内容 |
| `created_at` | `timestamptz default now()` | - | 创建时间 |
| `updated_at` | `timestamptz default now()` | - | 更新时间 |

### 12.9 `public.iteration_skill_modifications`

来源：

- `example/hitl/ddl/public.iteration_skill_modifications.txt`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `id` | `int4 not null` | - | 主键 |
| `batch_id` | `text not null` | - | 批次 ID |
| `target_skill` | `text not null` | - | 目标技能 |
| `modified_file` | `text` | - | 修改文件 |
| `backup_path` | `text` | - | 备份路径 |
| `changes` | `jsonb` | - | 变更详情 |
| `status` | `text` | - | 变更状态 |
| `created_at` | `timestamptz default now()` | - | 创建时间 |

约束：

- 主键：`(id)`
- 唯一键：`(batch_id, target_skill)`

### 12.10 `public.poi_verified_regression_test`

来源：

- `example/hitl/ddl/public.poi_verified_regression.txt`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `batch_id` | `text` | `关联 HITL 迭代批次，如 batch_0415` | |
| `dataset_id` | `text not null` | - | |
| `dataset_name` | `text not null` | - | |
| `id` | `text not null` | `POI唯一ID，业务主键` | |
| `name` | `text not null` | `POI名称` | |
| `x_coord` | `float4` | `经度` | |
| `y_coord` | `float4` | `纬度` | |
| `poi_type` | `text` | `POI类型` | |
| `address` | `text` | `地址` | |
| `city` | `text` | `城市` | |
| `city_adcode` | `text` | `城市编码` | |
| `status` | `text default '1'` | `POI状态：0-尚未开业；1-正常；2-软删；3-暂停营业；4-疑似下线` | |
| `true_name` | `text not null` | `真值-POI名称` | |
| `true_x_coord` | `float4` | `真值-经度` | |
| `true_y_coord` | `float4` | `真值-纬度` | |
| `true_poi_type` | `text` | `真值-POI类型` | |
| `true_address` | `text` | `真值-地址` | |
| `true_city` | `text` | `真值-城市` | |
| `true_city_adcode` | `text` | `真值-城市编码` | |
| `true_status` | `text default '1'` | `真值-POI状态：0-尚未开业；1-正常；2-软删；真值-3-暂停营业；4-疑似下线` | |
| `updatetime` | `timestamp default current_timestamp` | - | |
| `dataset_type` | `text not null` | - | |
| `verify_info` | `jsonb` | - | |
| `evidence_record` | `jsonb` | - | |
| `verified_name` | `text` | `核实后-POI名称` | |
| `verified_x_coord` | `float4` | `核实后-经度` | |
| `verified_y_coord` | `float4` | `核实后-纬度` | |
| `verified_poi_type` | `text` | `核实后-POI类型` | |
| `verified_address` | `text` | `核实后-地址` | |
| `verified_city` | `text` | `核实后-城市` | |
| `verified_city_adcode` | `text` | `核实后-城市编码` | |
| `verified_status` | `text default '1'` | `核实后-POI状态：0-尚未开业；1-正常；2-软删；3-暂停营业；4-疑似下线` | |
| `verified_verify_result` | `text` | `核实后-核实结果，核实通过/需人工核实` | |
| `sample_type` | `text not null` | `样本类型，正样本/负样本` | |
| `cur_verify_result` | `text not null` | `当前核实结论，核实通过/需人工核实` | |
| `cur_qc_status` | `text` | `当前质检结论，qualified/unqualified/risky` | |
| `task_id` | `text` | `用于回溯` | |

主键：

- `(dataset_name, id)`

### 12.11 `public.poi_verified_regression_test_compare`

来源：

- `example/hitl/ddl/public.poi_verified_regression_test_compare.txt`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `batch_id` | `text` | `关联 HITL 迭代批次，如 batch_0415` | |
| `dataset_id` | `text not null` | - | |
| `dataset_name` | `text not null` | - | |
| `dataset_type` | `text not null` | - | |
| `updatetime` | `timestamp default current_timestamp` | - | |
| `task_id` | `text not null` | - | 主键 |
| `id` | `text not null` | `POI唯一ID，业务主键` | |
| `compare_name` | `text` | `POI名称` | |
| `compare_x_coord` | `text` | `经度` | |
| `compare_y_coord` | `text` | `纬度` | |
| `compare_poi_type` | `text` | `POI类型` | |
| `compare_address` | `text` | `地址` | |
| `compare_city` | `text` | `城市` | |
| `compare_city_adcode` | `text` | `城市编码` | |
| `compare_status` | `text` | `POI状态：0-尚未开业；1-正常；2-软删；3-暂停营业；4-疑似下线` | |
| `is_consistent` | `varchar not null` | `是否与真值保持一致，是/否` | |
| `sample_type` | `text not null` | `样本类型，正样本/负样本` | |
| `compare_verify_result` | `text` | - | |
| `compare_qc_status` | `text` | - | |
| `new_verify_result` | `text` | - | |
| `new_qc_status` | `text` | - | |

主键：

- `(task_id)`

### 12.12 `public.poi_verified_regression_test_result`

来源：

- `example/hitl/ddl/public.poi_verified_regression_test_result.txt`

| 字段 | 类型 | 注释 | 备注 |
|---|---|---|---|
| `batch_id` | `text` | `关联 HITL 迭代批次，如 batch_0415` | |
| `dataset_id` | `text not null` | - | |
| `dataset_name` | `text not null` | - | |
| `dataset_type` | `text not null` | - | |
| `updatetime` | `timestamp default current_timestamp` | - | |
| `timestamp_suffix` | `text` | - | 运行后缀 |
| `total_count` | `int4` | `总样本数量` | |
| `positive_count` | `int4` | `正样本数量` | |
| `negative_count` | `int4` | `负样本数量` | |
| `verify_worsen_ratio` | `float8` | `核实逆向率` | |
| `verify_better_ratio` | `float8` | `核实提升率` | |
| `qc_worsen_ratio` | `float8` | `质检逆向率` | |
| `qc_better_ratio` | `float8` | `质检提升率` | |
| `total_worsen_ratio` | `float8` | `总体逆向率` | |
| `total_better_ratio` | `float8` | `总体提升率` | |
