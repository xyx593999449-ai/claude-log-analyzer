# Changelog

## [Unreleased] - 2026-04-03
### Docs
- **v3 时间体验修复文档归档**：新增 `doc/v3_dashboard_time_experience_optimization/01-requirements.md` 与 `02-development-plan.md`，系统化记录执行流量趋势、时间筛选、任务排序感知及日志详情时间展示的修复需求与可执行开发方案。
- **HITL 后端字段映射文档**：新增 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，拆清三张 HITL 迭代表到前端页面的直接字段、后端聚合字段与潜在扩展字段，并明确本轮不处理回归验证与最终结论。
- **HITL 首批字段口径确认**：更新 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，补充 `batchId`、`startedAt`、`issueCount`、根因标签中文展示与 `skillType` 展示口径的首批确认结果。
- **HITL 聚合展示口径确认**：继续更新 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，明确批次状态与流程进度统一由后端推导、建议区直接展示 Prompt、版本区改为“目标 Skill + 修改摘要 + 文件 + 状态 + 时间”。
- **HITL 流程与问题下钻口径确认**：继续更新 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，明确流程区保留六步，并在问题根因区增加下钻到人工标注任务详情的交互设计。
- **HITL 专属问题详情页口径确认**：继续更新 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，明确问题详情页采用 HITL 专属页面，并展示数字员工核实结果、质检结果、人工标注结果与模型分析结果四块信息。
- **HITL 后端接入文档包**：新增 `doc/v4_hitl_backend_adaptation/02-requirements.md`、`03-functional-design.md` 与 `04-development-plan.md`，系统化沉淀主页面后端接入、问题下钻和专属问题详情页的需求、设计与开发方案。

### Added
- **趋势图粒度与图例增强**：执行流量趋势补齐 `按小时 / 按 5 小时 / 按天` 三档真实聚合切换，并新增可交互图例以支持核实/质检单独显示。
- **任务与日志时间摘要可视化**：任务卡片折叠态新增“最新动作时间 + 排序依据 + 核实/质检时间”展示；日志详情新增阶段级时间摘要（执行状态、开始/结束、业务时间、耗时）。
- **HITL 后端四个核心接口落地**：新增 `GET /api/hitl/iterations`、`GET /api/hitl/iterations/:batchId`、`GET /api/hitl/iterations/:batchId/issues/:issueType/tasks`、`GET /api/hitl/iterations/:batchId/issues/:issueType/tasks/:taskId`，并统一接入 SQLite + PostgreSQL 仓储层。

### Changed
- **任务时间筛选交互升级**：任务列表筛选改为“快捷项 + 单时间点（之前/之后）+ 进阶时间段”模式，并默认选中“全部”。
- **接口契约扩展**：`overview` 接口新增 `timeGranularity` 参数，任务详情与日志详情返回结构补充时间语义字段。
- **日志详情时间线展示顺序优化**：日志详情页时间线统一按日志时间正序展示（从前到后），提高排查时序可读性与上下文连续性。
- **证据详情展示结构化**：任务卡片中的证据弹层由原始 `raw_data` 大段直出，调整为面向 `evidence_record` 的结构化证据卡，优先展示名称、地址、分类、距离、采集方式、有效性、置信度、采集时间与证据 ID，并保留精简原始摘要。
- **HITL 迭代前端 mock 页面**：新增 `/hitl-iterations` 路由与导航入口，参考“大-poi-核实数字员工”demo 的批次选择、飞轮流程和联调信息结构，先用 mock 数据落地完整前端页面，并保持当前仓库既有工业风看板语法。
- **HITL 口径在仓储层统一实现**：`batchId` 以 `iteration_negative_samples` 为主、`startedAt` 使用批次最早 `updatetime`、`issueCount` 采用“任一人工标注异常命中即计入”规则；流程保留 6 步且回归/最终结论返回待补充态。
- **HITL 根因区改为“批次总述 + 行级占比”**：根因卡片隐藏重复长文，新增批次级 `root_cause_analysis` 总述、`learnable_patterns` 与 `skill_impact` 展示，问题条目聚焦“原因/技能/数量/占比/下钻”。
- **HITL Prompt 与文本展示可读性增强**：Prompt 区采用 Markdown 预览与折叠展开；版本变更与根因文本新增分段、关键词高亮、按句换行，降低大段纯文本阅读负担。

### Fixed
- **趋势图按天不生效修复**：修复此前仅切换显示标签而未切换真实聚合的问题。
- **双仓储排序口径统一**：SQLite 与 PostgreSQL 统一按 `质检时间 > 核实时间 > 初始更新时间` 排序，并使用 `latest_action_time` 作为排序解释字段。
- **SQLite 时间筛选生效修复**：补齐任务列表与总览在 SQLite 下的时间过滤逻辑，支持小时级输入。
- **PG 批次归组时间异常修复**：`getBatches` 由原先基于 `task_id` 推导批次，调整为优先使用日志聚合表 `batch_id` 分组（缺失时才回退推导），避免批次被误拆分成单任务后导致“开始/完成时间仅几分钟”的偏差。
- **PG 批次主口径回切**：根据当前批次识别约定，`getBatches` 改回优先以 `task_id` 后缀归组，仅在任务 ID 无法解析批次时才回退使用日志 `batch_id`，与既有筛选口径保持一致。
- **Claude 日志时间提取兼容修复**：日志解析改为优先使用独立 `timestamp` 记录（含“前置时间戳 JSON + 实际日志对象”模式），仅在缺失时回退 `message.id` 的 `msg_yyyyMMddHHmmss` 提取，兼容历史日志与新日志格式。
- **PG `prompt_paths` 解析兼容修复**：`iteration_overlay_drafts.prompt_paths` 同时兼容 JSON 数组与 PG 数组字面量（`{"a","b"}`）解析，确保 Prompt 路径在 PG 环境可稳定展示。

## [v0.5.0] - 2026-04-01
### Added
- **执行流量趋势看板**：在主看板引入 Recharts 面积图，支持从小时级全量聚合至 5h 或天级维度展示，直观呈现核实与质检的吞吐动态。
- **Token 消耗透明化**：在任务详情页新增了输入、输出及总 Token 的实时统计展示。

### Fixed
- **批次过滤 UUID 兼容**：重构了 `buildWhere/buildAnd` 逻辑，支持任务 ID 为纯 UUID 格式时的精确筛选，解决了切换批次后趋势图消失的问题。
- **SQL 排序歧义修复**：解决了 PostgreSQL 下 `order by "updatetime" is ambiguous` 的报错，通过为排序列增加表别名限定确保了查询稳定性。
- **时间字段空值兼容**：完善了 `updatetime` 为 `null` 或空字符串 `''` 时的排序逻辑，确保此类异常数据自动沉底，不干扰运维视角。

### Changed
- **数据表正式化切换**：根据业务规范，将底层运行日志临时表 `temp_task_analysis` 全面更名为 `poi_task_analysis`。

### Improved
- **证据摘要交互优化**：将原本的 Hover 悬浮改为 Click 点击持续展示，解决了在复杂列表页面中浮窗闪烁或被遮挡的交互问题。

## [v0.4.0] - 2026-03-27
### Refactored
- **批次总用时逻辑重构**：由原来的任务耗时累加改为基于“挂钟时间”（Wall-clock time）计算，即批次内最早任务开始时间至最晚任务完成时间的真实时钟跨度，更符合业务对批次生产力的衡量标准。

### Fixed
- **“需人工介入”统计修正**：通过在 SQL 过滤中显式指定 `is_qualified = 0`，排除了处于初始状态或未质检任务的统计干扰，使全量异常分支中的人工介入计数回归真实值。

### Changed
- **全局指标口径统一**：
  - 统一大盘与批次概览的指标定义：自动化率以“已核实”为基准，质量指标统一使用“质检合格率”。
  - 任务列表默认排序优化：改为 `updatetime DESC NULLS LAST, task_id DESC`，确保运维人员能第一时间看到最新核实/质检的任务。
  - 术语对齐：全系统“核实质量”统一更名为“质检合格率”，对齐业务术语。

### Added
- **UI 增强与兜底**：
  - 批次概览总用时变色警告：根据任务量动态计算阈值（`Count * 5min * 2`），超时显示为红色，正常为绿色。
  - 待处理状态兜底：对于尚未开始核实的批次，相关指标统一显示为 `/`。

## [v0.3.0] - 2026-03-25
### Added
- **多批次联合筛选架构**：后端重构 SQLite 与 PostgreSQL 仓储库逻辑，全面支持 `?batch=A,B` 数组式多批次联合检索，大幅度增强了数据下钻与横向对比能力。
- **状态演算去噪重构**：修复了人工批次（无执行日志但业务状态为核实完成/质检完成）显示为“待处理”的逻辑漏洞，业务指标更加健壮精确。
- **大盘指标 Typography 升维**：全盘引入高质量 `font-mono tracking-tight` 渲染字重，使数字看板(`SpotlightCard`, `ExecutionCard`) 具备极客感与高穿透力的工业美学。
- **全局顶层导航枢纽 (Portal)**：废除旧有臃肿的全局卡片，重置出位于 Header 右侧的悬浮轻量级数据枢纽模块，视野更为清爽。
- **全量流程图重装 (Metro Flow)**：弃用原高饱和粗彩边框，以克制的极简高光白底配顶部焦点勾边为新轨范，极致降噪。
- **日志详情页导航与交互重塑**：
  - 新增层级分明的 **左上面包屑导航**（Breadcrumbs），有效防止在长调用链中的方向迷失。
  - 为长日志视图 (**TimelineView**) 深度挂载类似 VSCode 的 **互动微缩图 (Minimap)**。精准将执行报错投影为右侧微缩红轴，支持点击瞬间触发展示屏平滑滚动（ScrollTo）定点致错根因，排错体验脱胎换骨。
- **沉浸式 Dropzone 空状态**：彻底重印了日志页 (`/logs`) 的原生冷启动态，利用 Flexbox 与虚线层构建带有产品功能引导模块的高级宽域拖拽着陆场。

### Fixed
- **Tooltip 悬浮遮挡修复**：深度优化 `TaskFlowCard` 微卡片的 CSS Stack 隔离，追加动态层级悬浮触发机制 (`hover:z-[200]`)，彻底穿透消除了因文档压层导致的 Evidence 及 Alert 标签浮窗被裁切遮挡的样式顽疾。
## [v0.2.0] - 2026-03-24
### Added
- **批次概览与路由分层**：全面引入 `react-router-dom` 进行前端路由重构，剥离并新增了清晰隔离的批次概览主干页面 (`/batches`)、任务底层数据看板 (`/tasks`) 及专注日志读取的详情页 (`/logs/:taskId`)。
- **批次卡片全量指标**：极大地丰富了批次概览卡片，现在直观地全面展示从底层分析聚合出的任务量、累计用时、自动化核实率、质检端合格率、各维度 Token 总消耗以及首尾推进的关键时间节点；完善并支持各类异常的警告胶囊提示与阶段高亮展示（如待处理、进行中、已完成、需关注）。
- **全局动态环境重载切换**：在前端 React 结构顶部的主 Layout 引入全局环境 Toggle 切换器。由后端基于读取 `x-db-client` 头参数实现连接代理分发，支持随时毫秒级在本地虚拟 SQLite mock 库与跨主机真实的 PostgreSQL 生产配置节点间做无痛顺滑的动态连接切换。

## [v0.1.1] - 2026-03-20
### Refactored
- **系统架构瘦身**：全面剥离前序遗留版本基于大文本手动导入内存切片的过度设计逻辑，彻底移除繁重的底层原生 parser，将系统核心收束为极致轻量的直读展示型监控态，规避应用内存崩溃。
- **直读检索层**：重写底层提取逻辑，深度介入第三方流式日志流水线表 `poi_claude_log`；废弃原本地化日志索引检索方案。
- **数据库规范化**：旧版态势存算临时表 `temp_task_analysis` 升级为全局统一的业务流表 `poi_task_analysis`。

### Changed
- 改进可视化模块交互细节，任务详情模块调整缩展与收起操作习惯。
- 新增异常流监控高亮提醒层级。

## [v0.1.0] - 2026-03-18
### Added
- 大 POI 核实场景的数字员工系统初版基础交付。
- 内置初步的执行流程解析呈现以及底层开发环境基础设施就绪。
