# 开发方案：HITL 新建迭代批次与人工标注结果导入

## 1. 开发目标

基于已确认需求，本轮开发目标如下：

1. 在 `HITL` 页面顶部新增“新建迭代批次”入口
2. 支持 `batch_id` 手填、拖拽上传和点击选择 `CSV`
3. 对上传文件执行严格校验，重复 `batch_id` 或数据异常直接报错
4. 在校验全部通过后展示局部预览
5. 用户确认后将数据写入 PostgreSQL 的 `public.t_poi_key_property_check_result_ext_0416`

---

## 2. 本轮范围与边界

## 2.1 本轮纳入范围

- 页面顶部新建迭代批次入口
- 导入弹窗与上传交互
- `CSV` 文件解析
- `UTF-8 无 BOM` 编码校验
- `batch_id` 重复校验
- 表头、值域、标签与重复行校验
- 预览接口与正式导入接口
- 写入 `public.t_poi_key_property_check_result_ext_0416`
- PG 表补充 `batch_id` 字段与索引

## 2.2 本轮不纳入范围

- `HITL` 页面主查询切换到 `t_poi_key_property_check_result_ext_0416`
- SQLite 导入实现
- 导入后自动生成分析结果或回归结果
- 覆盖导入、增量合并、删除批次
- 支持 `xlsx / json / jsonl`

---

## 3. 预计改造触点

## 3.1 后端

- `server/index.ts`
- `server/types.ts`
- `server/repository.pg.ts`
- `server/pgConfig.ts`（如需补配置说明）

## 3.2 前端

- `src/components/dashboard/HITLIterationPage.tsx`
- `src/lib/dashboardApi.ts`
- `src/lib/dashboardTypes.ts`
- 如需复用，可拆出上传弹窗组件到 `src/components/dashboard/`

## 3.3 文档

- `README.md`
- `CHANGELOG.md`
- `doc/v4_hitl_backend_adaptation/07-hitl-iteration-batch-import-requirements.md`
- `doc/v4_hitl_backend_adaptation/08-hitl-iteration-batch-import-development-plan.md`

---

## 4. 总体实施策略

## 4.1 基本策略

- 先补数据库约束与导入契约，再接前端
- 严格校验优先，不做宽松容错导入
- 预览只在全部校验通过后展示
- 正式导入必须基于已通过校验的数据，不重新放宽规则
- 本轮只保障 PG 主链路

## 4.2 推荐开发顺序

1. 明确表结构与导入 DTO
2. 实现后端 `CSV` 解析和校验逻辑
3. 实现预览接口与正式导入接口
4. 前端接入弹窗与上传交互
5. 联调成功态、失败态与局部预览
6. 补 README / CHANGELOG / 文档

---

## 5. 可执行任务拆解

## 5.1 T1：补数据库结构

### 目标

让 `public.t_poi_key_property_check_result_ext_0416` 具备迭代批次导入能力。

### 具体改动

- 为 `public.t_poi_key_property_check_result_ext_0416` 增加 `batch_id varchar(255)`
- 为 `batch_id` 增加普通索引

### 完成标准

- 新导入数据可以按 `batch_id` 过滤
- 后续 `HITL` 切表时无需再次补字段

---

## 5.2 T2：定义后端导入类型与校验模型

### 目标

建立预览和导入所需的统一 DTO、错误结构和校验结果结构。

### 修改文件

- `server/types.ts`

### 建议新增类型

- `HitlBatchImportPreviewRow`
- `HitlBatchImportPreviewResponse`
- `HitlBatchImportErrorDetail`
- `HitlBatchImportCommitResult`
- `HitlBatchImportNormalizedRow`

### 完成标准

- 预览接口和正式导入接口共用统一数据模型
- 前后端错误结构可直接渲染

---

## 5.3 T3：实现 CSV 解析与严格校验

### 目标

把上传文件解析成结构化记录，并完成所有阻断式校验。

### 修改文件

- `server/index.ts`
- `server/repository.pg.ts`
- 可根据需要新增 `server/importers/hitlBatchCsv.ts`

### 校验顺序

1. `batch_id` 格式校验
2. `batch_id` 重复校验
3. 文件扩展名校验
4. `UTF-8 无 BOM` 编码校验
5. 表头校验
6. 行级必填校验
7. 枚举值校验
8. 标签白名单校验
9. 文件内重复 `id / task_id` 校验

### 关键点

- `CSV` 解析前先检查编码，不满足则直接失败
- `admin_judgement_problem` 归一为 `admin_judgment_problem`
- 只要发现任意错误，就返回失败，不进入预览

### 完成标准

- 不合法文件无法进入预览态
- 错误信息带行号和字段名

---

## 5.4 T4：实现预览接口

### 目标

在全部校验通过后，返回前端局部预览数据，供用户最终确认。

### 新增接口

- `POST /api/hitl/iterations/import-preview`

### 输入

- `multipart/form-data`
- `batch_id`
- `file`
- `summary?`
- `source?`

### 输出

- 预览摘要
- 前 `10 ~ 20` 行数据
- `previewToken`

### 完成标准

- 成功时可回显局部预览
- 失败时不返回预览，只返回错误

---

## 5.5 T5：实现正式导入接口

### 目标

基于已通过校验的数据执行正式入库。

### 新增接口

- `POST /api/hitl/iterations/import`

### 输入

- `previewToken`

### 行为

- 校验 `previewToken` 有效性
- 使用预览阶段缓存或序列化保存的标准化数据
- 开启事务写入 `public.t_poi_key_property_check_result_ext_0416`
- 每一行补写统一的 `batch_id`

### 完成标准

- 成功写入整批数据
- 任意异常整批回滚

---

## 5.6 T6：接入前端上传弹窗

### 目标

让 `HITL` 页面具备完整的新建批次导入交互。

### 修改文件

- `src/components/dashboard/HITLIterationPage.tsx`
- `src/lib/dashboardApi.ts`
- `src/lib/dashboardTypes.ts`

### 具体改动

- 新增顶部按钮
- 新增弹窗
- 支持拖拽上传和点击选文件
- 支持 `batch_id` 必填校验
- 调用预览接口
- 成功后展示局部预览
- 点击确认后调用正式导入接口
- 成功后提示并刷新当前页面

### 完成标准

- 用户可从页面直接发起建批导入
- 失败态、预览态、导入成功态完整可用

---

## 6. 技术实现建议

## 6.1 编码校验

建议在后端读取文件 Buffer 后先判断：

- 是否能按 `UTF-8` 成功解码
- 开头是否包含 UTF-8 BOM

若包含 BOM，直接返回错误，不做自动去除。

## 6.2 CSV 解析

本项目当前未引入专门 CSV 库。本轮有两种可选路径：

1. 引入轻量 CSV 解析库
2. 自行实现最小解析器

推荐：

- 若 `CSV` 可能包含带引号、逗号和换行的复杂字段，优先引入成熟解析库
- 若业务文件格式稳定简单，再考虑最小解析器

## 6.3 预览数据缓存

正式导入建议基于 `previewToken`，避免：

- 前端重复上传同一文件
- 预览与正式导入两次解析结果不一致

可选做法：

- 内存缓存短期保存标准化结果
- 或将标准化结果暂存到临时文件

本轮优先推荐内存短缓存，设置过期时间即可。

---

## 7. 联调与验收清单

## 7.1 成功路径

- 输入合法 `batch_id`
- 上传合法 `CSV`
- 成功返回预览
- 确认导入成功
- PG 中可查到该 `batch_id` 的完整数据

## 7.2 失败路径

- `batch_id` 为空
- `batch_id` 非法
- `batch_id` 已存在
- 文件不是 `CSV`
- 文件带 BOM
- 缺少 `id / task_id / manual_comment`
- 枚举值非法
- 标签非法
- 文件内重复 `id`
- 文件内重复 `task_id`

---

## 8. 风险与注意事项

### 8.1 表结构未及时变更

若 PG 生产环境尚未给 `t_poi_key_property_check_result_ext_0416` 增加 `batch_id`，则导入链路无法正式启用。

### 8.2 CSV 实际复杂度高于预期

若业务导出的 `CSV` 中包含大量引号、逗号、换行等复杂内容，自研最小解析器风险较高，应优先引入成熟解析库。

### 8.3 后续切表口径不一致

本轮需确保导入字段命名与未来查询映射一致，避免后续切表时再次做字段含义重解释。

---

## 9. 建议交付顺序

1. 数据库字段与索引
2. 后端导入 DTO 与校验器
3. 预览接口
4. 正式导入接口
5. 前端弹窗与上传交互
6. 联调、文档与发布说明
