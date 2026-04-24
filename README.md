# Claude Log Analyzer

当前版本：`v0.6.0`（2026-04-17）

> 2026-03-25 更新：全系统顺利通过了产品经理主导的极高标准视觉升维与重构。后端正式打通多批次联合筛选聚合 API (`?batch=A,B`)。前端主看板全面强化了工业级 Mono 数据渲染字体及微投影呼吸卡片；特别在前线底层分析侧，开创性地引入了 **VSCode 级代码错误探测微缩雷达 (Interactive Minimap)**，支持一键长距精准下钻至极其微小的异常锚点，辅以全局修复的无边界浮窗与面包屑体系，护航业务深度探索体验。

面向全流程的大 POI 核实与质检链数字员工所配建的高深度结构化日志分析台。极大地方便业务专员用以把控整个任务分发流水线上的宏观核实趋势、特定异常流巡检、下钻长日志排障微缩探查以及底层大模型的具体内部推导反刍。

联合交接材料入口：

- [BigPOI 与 Claude Log Analyzer 联合交接材料（2026-04-20 初稿）](../handover_bigpoi_claude_log_analyzer_2026-04-20.md)

---

## 1. 业务核心能力支撑

- **批次动态概览**：按外部传入批次特征进行宏观切片，一阶鸟瞰整个批次的系统运行状态，囊括各项覆盖自动化评估数据、任务卡滞或质检直出驳回反馈记录。
- **运行环境瞬间热切**：直接位于产品最外层视图框架右上方设计的高可用组件，单向即抛地控制底层 API 实时对接 SQLite 的 Mock 配置区或是 Postgres 服务器的数据资源仓。
- **全链路轨道监测**：深度记录按单一目标从触发到得出终极判定所经历的地铁图式推进流程及对应的详细时间戳追溯与风险点。
- **大模型长日志下钻精读**：双轴丝滑滚动的专用高光分析器面盘，原样重现各层深度 Agent 执行时的内部思考树、工具函数钩子调用记录和详细上下游传输消耗及预警。

## 2. 界面视图分布速览

### 2.1 批次视图主干 (`/batches`)
- 展示自研的宏观数据呈现卡片阵列组合，高度模块化且排版优良的网格卡片列出各项全量归约数据（如耗时、批次 Token 流水总耗等）。
- 多位并排的风险防漏掉提示挂标（如颜色自驱动响应为处理中、已完成、含红框警告等）。
- 提供一键跳转到指定批次过滤条件下的详单长列板。

### 2.2 任务列表(执行看板区) (`/tasks`)
- 列出含有极详细分层信息的独立任务流程明细行。
- 提供异常提示 Tag（如高频重试告警），多点证据摘要追踪等丰富信息。
- 证据来源标签支持点击展开，结构化展示证据名称、地址、分类、距离、采集方式、有效性、置信度与证据 ID，并保留精简原始摘要供排查。

### 2.3 日志回溯 (`/logs/:taskId`)
- 将核实态和质检查核态做彻底的信息隔离。
- 提供大模型原初 Prompt 对撞呈现及日志高光。

### 2.4 HITL 迭代运营页 (`/hitl-iterations`)
- 以前端 mock 数据先行落地“人工反馈结果池 -> LLM 分析 -> 双 Skill 迭代 -> 候选版本 -> 联合回归 -> 发布结论”的完整页面。
- 参考独立 demo 的信息结构，同时复用当前仓库既有米白工业风看板语言，不引入新的组件体系。
- 页面已提供迭代批次列表、运营飞轮、问题归因、双 Skill 建议、候选版本、联合回归与发布决策等完整分区。
- 页面显式区分 `人工反馈结果池`、`迭代批次` 与 `任务执行批次` 三种语义边界，并补充页内导览锚点，方便长页浏览。
- 已新增 `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md`，用于收敛三张 HITL 迭代表到前端页面分区的字段映射、聚合边界与后续展示增减决策。
- `doc/v4_hitl_backend_adaptation/01-hitl-db-to-frontend-mapping.md` 已继续补充回归三表（`poi_verified_regression_test / compare / result`）到回归验证区与回归详情页的展示方案、字段映射与 `batch_id = batch_0415` 统一口径。
- 已新增 `doc/v4_hitl_backend_adaptation/02-requirements.md`、`03-functional-design.md`、`04-development-plan.md`，用于沉淀 `HITL` 页面后端接入、问题下钻和专属问题详情页的需求、功能设计与开发方案。
- 已新增 `doc/v4_hitl_backend_adaptation/07-hitl-negative-samples-table-switch-plan.md`，用于收敛 `iteration_negative_samples` 切换到 `t_poi_key_property_check_result_ext` 时的最终字段规格、`verify_info` 补齐前提、`qc_result` 派生口径与 mock 同步策略。
- 已新增 `doc/v4_hitl_backend_adaptation/09-pg-production-table-dependencies.md`，用于汇总当前正式环境 PostgreSQL 依赖的业务主表、运行分析表、HITL 主表 / 回退链路与回归三表，以及代码真实读取字段和主表候选顺序。
- 已新增 `doc/v4_hitl_backend_adaptation/10-hitl-cluster-task-analysis-requirements.md` 与 `11-hitl-cluster-task-analysis-development-plan.md`，用于收敛 `iteration_overlay_drafts` / `iteration_skill_modifications` 新 `jsonb` 结构、`task_analysis_results.analysis_comment` 接入问题详情页，以及 `HITL` 主页面问题分析/迭代建议/候选版本的切换方案。
- HITL 人工反馈结果池读取链路已按该方案落地：正式环境 PG 仓储当前只读取 `t_poi_key_property_check_result_ext`；若命中新表会在仓储层完成 `quality_status <- qc_status`、`updatetime <- create_time`、`qc_score / has_risk / is_qualified / is_manual_required <- qc_result` 的兼容映射。`public.v_hitl_negative_samples`、`public.iteration_negative_samples`、`public.iteration_negative_samples_0415_bak` 都视为旧开发遗留对象，不再参与正式环境读取链路；正式环境只保留不带后缀的 `iteration_overlay_drafts`、`iteration_skill_modifications` 两张迭代表。`t_poi_key_property_check_result_ext` 只允许 `insert / select`，严禁 `update / delete`。
- 后端已提供 `HITL` 专用 API：`GET /api/hitl/iterations`、`GET /api/hitl/iterations/:batchId`、`GET /api/hitl/iterations/:batchId/issues/:issueType/tasks`、`GET /api/hitl/iterations/:batchId/issues/:issueType/tasks/:taskId`，并兼容 SQLite / PostgreSQL 仓储。
- HITL 后端解析已按新约束落地：`iteration_overlay_drafts.overlay_draft` 现优先解析 `clusters`（旧 `issue_distribution/learnable_patterns/skill_impact` 兜底），`iteration_skill_modifications.changes` 现优先解析 `description/modifications/error`（旧 `summary/modified_files` 兜底）；同时问题详情接口已接入 `task_analysis_results` 并新增 `taskAnalysis`（重点输出 `analysis_comment` 与分段结果）。
- SQLite mock 初始化已补齐 `example/hitl/example/` 下回归三表样例导入，默认会把回归摘要、差异明细与样本详情灌入本地演示库，便于直接在 `/hitl-iterations` 查看真实回归展示效果。
- HITL 回归区与回归详情页的展示文案已收敛为业务视角，移除“等待后端返回 / 待补充 / 原因说明”等研发占位措辞，避免把需求与实现过程暴露到前端界面。
- HITL 回归指标展示已明确以 `poi_verified_regression_test_result` 为权威口径；页面不再把 `positive_count / negative_count` 误展示为“变好样本 / 变差样本”，改为按字段真实语义展示“正样本 / 负样本”。
- HITL 回归区已进一步收敛信息层级：顶部统一展示运行时间、数据集、总样本、正样本、负样本；核实 / 质检卡片内部仅保留对应结论与两项核心指标（核实逆向率/提升率、质检逆向率/提升率），不重复展示公共信息。
- `iteration_overlay_drafts` 已结构化接入主页面：新增批次级根因总述、可学习模式、技能影响展示；根因分布卡片保持“问题原因 + 对应技能 + 数量 + 占比轴 + 问题下钻”紧凑呈现，避免重复长文。
- Prompt 区按技能分组并使用 Markdown 预览渲染，长文本默认折叠支持展开；版本变更摘要支持按句分段、重点词高亮与灵活换行，提升可读性。
- 已新增 `doc/v4_hitl_backend_adaptation/06-hitl-main-page-display-optimization.md`，固化本轮 HITL 主页面展示优化需求：流程图与模块联动、横向主卡切换、上一/下一按钮、默认从当前进行步骤展示并跳过 `反馈池` 内容页。
- 已新增 `doc/v4_hitl_backend_adaptation/07-hitl-iteration-batch-import-requirements.md` 与 `08-hitl-iteration-batch-import-development-plan.md`，用于收敛 `HITL` 页顶部“新建迭代批次”入口、人工标注 `CSV` 上传、严格校验、成功预览确认以及写入 `t_poi_key_property_check_result_ext` 的需求与开发方案。
- HITL 主页面已完成“流程导航联动 + 单主卡切换”改造：流程节点点击、上一/下一按钮、键盘左右键会驱动同一内容舞台切换；支持按批次记忆最近停留模块，并通过主卡最小高度与高度过渡降低切换抖动。

## 3. 技术项目字典

| 核心功能段 | 说明简述 | 存储空间指引 |
|---|---|---|
| **前端看板架构** | 首页骨架、路由接管及界面展现 | `src/components/dashboard` |
| **基础日志重装展示** | Token展示及代码态执行面板 | `src/components/legacy` |
| **接口路由数据转发** | 后端环境接管并负责跨库代理动态组装能力 | `server/` |

## 4. 脚手架部署指北

```bash
# 依赖一键拉取
npm install

# 客户端热更新与界面投屏服务映射
npm run dev:web   # (默认端口 => 3000)

# 服务端节点侦听与跨界 API 钩子守候
npm run dev:api   # (默认端口 => 3001)

# 流水线打包编绎预演
npm run lint
npm run build
```

补充说明：后端在正式环境启动时，如果不存在 `example/db_conf/sample_data.json`，会自动跳过 SQLite mock 样例灌库，不影响服务启动。

## 5. 通用计算口径核算标示

*   **全流自动化率基准**：`1 - (需人工介入数 / 已完成核实任务总数)`
*   **需人工介入口径**：`verify_result = '需人工核实'` 或 `is_qualified = 0`；未进入质检、`is_qualified IS NULL` 的任务不计入人工介入。
*   **质检合格率指标**：`(质检合格任务数) / (已完成质检任务总数)`
*   **PG 批次归组口径**：批次概览默认优先使用 `task_id` 的后缀规则归组；仅当任务 ID 无法解析出批次时，才回退使用日志聚合表中的 `batch_id`。
*   **Claude 日志时间提取口径**：优先使用日志中的 `timestamp`（包括“独立时间戳 JSON + 日志对象”交替写入格式），若缺失再回退解析 `message.id` 的 `msg_yyyyMMddHHmmss` 时间。
*   **日志详情时间线排序口径**：时间线按时间正序展示（从前到后）；有时间戳的事件优先按时间排序，无时间戳事件保持原出现顺序并排在其后。
## 6. 项目共建与文档 (Development & Contribution)

为了保障项目的长期协作质量，请在参与开发前查阅以下文档：

*   **[项目共建准则](doc/contribution_guidelines.md)**：包含代码规范、Git 提交要求及数据库兼容性说明。
*   **[历史迭代文档](doc/)**：按版本号归档的所有需求文档、开发计划及验收记录。
    *   [v1_big_poi (大 POI 可视化)](doc/v1_big_poi/)
    *   [v2_dashboard_optimization (近期看板优化)](doc/v2_dashboard_optimization/)
    *   [v3_dashboard_time_experience_optimization (执行流量趋势与时间交互修复优化，含需求与开发计划)](doc/v3_dashboard_time_experience_optimization/)
    *   [v4_hitl_backend_adaptation (HITL 后端字段映射与适配收敛)](doc/v4_hitl_backend_adaptation/)
    *   [v4_hitl_backend_adaptation/05-hitl-regression-detail-page-refactor-design.md (HITL 回归详情页重构设计)](doc/v4_hitl_backend_adaptation/05-hitl-regression-detail-page-refactor-design.md)
    *   [v4_hitl_backend_adaptation/06-hitl-main-page-display-optimization.md (HITL 主页面展示优化需求)](doc/v4_hitl_backend_adaptation/06-hitl-main-page-display-optimization.md)
    *   [v4_hitl_backend_adaptation/07-hitl-iteration-batch-import-requirements.md (HITL 新建迭代批次与人工标注导入需求)](doc/v4_hitl_backend_adaptation/07-hitl-iteration-batch-import-requirements.md)
    *   [v4_hitl_backend_adaptation/08-hitl-iteration-batch-import-development-plan.md (HITL 新建迭代批次与人工标注导入开发方案)](doc/v4_hitl_backend_adaptation/08-hitl-iteration-batch-import-development-plan.md)
    *   [v4_hitl_backend_adaptation/09-pg-production-table-dependencies.md (正式环境 PostgreSQL 依赖表与字段规格清单)](doc/v4_hitl_backend_adaptation/09-pg-production-table-dependencies.md)
    *   [v4_hitl_backend_adaptation/10-hitl-cluster-task-analysis-requirements.md (HITL 问题簇分析、候选执行结果与任务级详情分析需求)](doc/v4_hitl_backend_adaptation/10-hitl-cluster-task-analysis-requirements.md)
    *   [v4_hitl_backend_adaptation/11-hitl-cluster-task-analysis-development-plan.md (HITL 问题簇分析、候选执行结果与任务级详情分析开发方案)](doc/v4_hitl_backend_adaptation/11-hitl-cluster-task-analysis-development-plan.md)

---
*本系统由数字员工团队维护，持续通过工程化手段优化核实与质检效能。*
