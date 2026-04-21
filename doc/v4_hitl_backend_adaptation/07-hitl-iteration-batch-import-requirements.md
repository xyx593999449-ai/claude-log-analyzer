# 需求文档：HITL 新建迭代批次与人工标注结果导入

## 1. 背景与目标

当前 `HITL` 页面已经具备迭代批次浏览与问题分析展示能力，但批次数据仍主要依赖既有样例或离线准备结果，缺少一个面向业务同学的正式建批入口。

本轮目标是在 `HITL` 页面顶部新增“新建迭代批次”能力，让用户能够上传人工标注结果的 `CSV` 文件，由系统完成严格校验，并把数据写入 PostgreSQL 的 `public.t_poi_key_property_check_result_ext` 表，为后续把 `iteration_negative_samples` 切换到该表做准备。

本轮只做：

1. 前端新建批次入口与上传交互
2. 后端 `CSV` 解析与严格校验
3. 数据写入 `public.t_poi_key_property_check_result_ext`
4. 成功导入后的局部数据预览与成功反馈

本轮不做：

1. `HITL` 页面主查询从 `iteration_negative_samples` 切表
2. 导入后自动生成 overlay、根因分析或回归结果
3. 支持 `Excel / JSON / JSONL` 等其它格式
4. 支持重复 `batch_id` 的覆盖、合并或追加导入

---

## 2. 用户已确认的核心口径

### 2.1 目标表

- 正式写入 PostgreSQL 表：`public.t_poi_key_property_check_result_ext`
- 当前表结构需在现有 DDL 基础上新增 `batch_id`

### 2.2 批次口径

- `batch_id` 由用户在页面手动输入
- `batch_id` 为必填项
- `batch_id` 不允许重复
- 只要目标表中已存在任意一条相同 `batch_id` 的记录，即判定该批次已存在并拒绝导入

### 2.3 上传方式

- 支持拖拽上传
- 支持点击后选择文件上传

### 2.4 文件格式

- 仅支持 `CSV`
- 编码要求：`UTF-8 无 BOM`

### 2.5 校验与预览

- 数据校验有问题时，直接报错，不进入预览态
- 只有在文件解析和校验全部通过后，才允许展示部分数据预览，供用户确认
- 用户确认后再执行正式入库

### 2.6 本轮边界

- 本轮只完成导入到 `t_poi_key_property_check_result_ext`
- `HITL` 页面仍沿用当前查询链路，不在本轮切表

---

## 3. 数据源规格

上传文件字段以：

- `example/hitl/ddl/public.t_poi_key_property_check_result_ext_0416.txt`

为准。

页面额外输入的 `batch_id` 不要求出现在 `CSV` 内；入库时统一写入每一行。

如果 `CSV` 中携带了 `batch_id` 列，本轮建议直接忽略，以页面输入值为准，避免文件内容与页面输入不一致。

---

## 4. 页面需求

## 4.1 入口位置

- 在 `HITL` 页面顶部标题区右侧新增主按钮：`新建迭代批次`

## 4.2 弹窗结构

弹窗建议包含以下区域：

### 4.2.1 基础信息区

- `batch_id` 输入框
- `summary` 输入框，可选
- `source` 输入框，可选

其中：

- `batch_id` 必填
- `summary` / `source` 本轮可以仅作为前端扩展位，不要求立即写入业务表

### 4.2.2 文件上传区

- 拖拽上传区域
- 点击选择文件按钮
- 附带上传要求提示：
  - 仅支持 `CSV`
  - 必须为 `UTF-8 无 BOM`

### 4.2.3 预览确认区

- 仅在后端校验通过后显示
- 展示导入摘要
- 展示前若干行数据预览
- 提供“确认导入”按钮

---

## 5. 交互流程

建议的用户流程如下：

1. 用户点击 `新建迭代批次`
2. 填写 `batch_id`
3. 拖拽或选择 `CSV` 文件
4. 点击 `校验并预览`
5. 后端执行重复批次检查、文件解析与数据校验
6. 若失败：直接返回错误并停留在弹窗
7. 若成功：返回部分数据预览
8. 用户点击 `确认导入`
9. 后端将整批数据写入 `public.t_poi_key_property_check_result_ext`
10. 前端提示导入成功，并可刷新当前 `HITL` 页面

---

## 6. 校验需求

## 6.1 表单级校验

- `batch_id` 必填
- `batch_id` 仅允许字母、数字、下划线、短横线
- 文件必传

建议 `batch_id` 规则：

- 长度 3 到 64
- 正则：`^[A-Za-z0-9_-]+$`

## 6.2 批次重复校验

- 在正式预览或导入前查询 `public.t_poi_key_property_check_result_ext`
- 若已存在相同 `batch_id` 的任意记录，则直接报错
- 本轮不支持覆盖导入、追加导入或合并导入

## 6.3 文件级校验

- 文件扩展名必须为 `.csv`
- 文件编码必须为 `UTF-8 无 BOM`
- 文件不能为空
- 第一行必须为表头

## 6.4 表头级校验

按当前 DDL，建议至少要求以下字段存在：

- `id`
- `task_id`
- `manual_comment`

同时，文件中至少应包含一部分人工判定字段，否则不构成有效人工标注结果：

- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`

## 6.5 数据级校验

每一行至少校验：

- `id` 非空
- `task_id` 非空
- `manual_comment` 非空
- 文件内 `id` 不重复
- 文件内 `task_id` 不重复
- `verify_content_is_correct / verify_action_is_correct / qc_intercept_is_correct` 仅允许 `1 / 0 / 空`
- `evidence_status` 仅允许 `1 / 0 / 2 / 空`
- `issue_observation_tags` 仅允许系统已知标签
- `judgment_dimension_tags` 仅允许系统已知标签

### 6.5.1 `issue_observation_tags` 允许值

- `evidence_missing`
- `evidence_invalid`
- `evidence_conflicting`
- `invalid_evidence_cited`

### 6.5.2 `judgment_dimension_tags` 允许值

- `name_judgment_problem`
- `address_judgment_problem`
- `type_judgment_problem`
- `location_judgment_problem`
- `admin_judgment_problem`
- `evidence_usage_problem`
- `manual_escalation_strategy_problem`
- `qc_intercept_rule_problem`

### 6.5.3 兼容归一化

DDL 注释中存在：

- `admin_judgement_problem`

与现有页面口径：

- `admin_judgment_problem`

拼写不一致的问题。

本轮要求在导入层做兼容归一化：

- 若源文件出现 `admin_judgement_problem`，统一转为 `admin_judgment_problem`

---

## 7. 预览需求

本轮预览只在“全部校验通过”后展示。

## 7.1 预览摘要

建议展示：

- `batch_id`
- 文件名
- 总记录数
- 实际可导入记录数
- 识别到的表头字段数

## 7.2 表格预览

建议展示前 `10 ~ 20` 行，并优先展示：

- `id`
- `task_id`
- `name_chn`
- `addr_chn`
- `poi_type`
- `city`
- `verify_result`
- `qc_status`
- `verify_content_is_correct`
- `verify_action_is_correct`
- `qc_intercept_is_correct`
- `evidence_status`
- `issue_observation_tags`
- `judgment_dimension_tags`
- `manual_comment`

---

## 8. 入库需求

## 8.1 入库目标

- `public.t_poi_key_property_check_result_ext`

## 8.2 入库策略

- 整批事务写入
- 所有校验通过后才允许入库
- 任意一条写入失败则整批回滚
- `batch_id` 统一使用页面输入值写入每一行

## 8.3 本轮表结构变更

建议新增字段：

- `batch_id varchar(255)`

建议新增索引：

- `idx_t_poi_key_property_check_result_ext_batch_id`

---

## 9. 接口需求

本轮建议拆分为两个接口。

## 9.1 校验与预览接口

`POST /api/hitl/iterations/import-preview`

请求：

- `multipart/form-data`
- `batch_id`
- `file`
- `summary?`
- `source?`

行为：

- 校验 `batch_id`
- 校验重复批次
- 校验文件格式与编码
- 解析 `CSV`
- 校验表头与数据
- 校验全部通过后返回预览数据

## 9.2 正式导入接口

`POST /api/hitl/iterations/import`

请求：

- 推荐基于预览阶段返回的 `previewToken` 再确认导入

行为：

- 使用预览阶段已通过校验的数据
- 事务写入 `public.t_poi_key_property_check_result_ext`
- 返回导入结果

---

## 10. 成功与失败反馈

## 10.1 成功反馈

- 提示导入成功
- 返回 `batch_id`
- 返回导入条数
- 允许前端刷新 `HITL` 页面或切换到该批次上下文

## 10.2 失败反馈

失败时不进入预览，直接提示错误原因。

建议错误类型包括：

- `batch_id` 已存在
- 文件格式错误
- 文件编码错误
- 表头缺失关键字段
- 第 N 行字段值非法
- 文件内出现重复 `id`
- 文件内出现重复 `task_id`

---

## 11. 后续衔接

本轮导入完成后，为后续 `HITL` 页面从 `iteration_negative_samples` 切换到 `t_poi_key_property_check_result_ext` 提前准备数据基础。

追加写入约束：

- `public.t_poi_key_property_check_result_ext` 只允许 `insert / select`
- 严禁对原表执行 `update / delete`

后续切表时，建议按以下映射关系读取：

- `batchId <- batch_id`
- `taskId <- task_id`
- `name <- name_chn`
- `address <- addr_chn`
- `poiType <- poi_type`
- `city <- city`
- `verifyResult <- verify_result`
- `qcStatus <- qc_status`
- `evidenceRecord <- evidence_record`
- `qcResult <- qc_result`
- `verifyContentIsCorrect <- verify_content_is_correct`
- `verifyActionIsCorrect <- verify_action_is_correct`
- `qcInterceptIsCorrect <- qc_intercept_is_correct`
- `evidenceStatus <- evidence_status`
- `issueObservationTags <- issue_observation_tags`
- `judgmentDimensionTags <- judgment_dimension_tags`
- `manualComment <- manual_comment`
