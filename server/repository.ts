import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { AggregatedTaskRun, AnalysisPhase, DashboardFilters, ImportSnapshot, SampleSeedRecord } from "./types";

export interface DashboardOverview {
  totalTasks: number;
  verifyStatusCounts: Array<{ status: string; count: number }>;
  flowStageCounts: Array<{ stage: string; count: number }>;
  verifyMetrics: Metrics;
  qcMetrics: Metrics;
  manualMonitoring: {
    manualTaskCount: number;
    anomalyCount: number;
    qcRejectedCount: number;
    latestImport: ImportSnapshot | null;
  };
}

export interface DashboardFilterOptions {
  verifyStatuses: string[];
  qcStatuses: string[];
}

interface Metrics {
  taskCount: number;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  automationRate: number;
  verificationQualityRate: number;
  avgDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
}

export interface DashboardTaskItem {
  taskId: string;
  poiId: string | null;
  name: string | null;
  city: string | null;
  address: string | null;
  poiType: string | null;
  initVerifyStatus: string | null;
  verifiedStatus: string | null;
  verifyResult: string | null;
  qcStatus: string | null;
  qualityStatus: string | null;
  isManualRequired: boolean;
  hasRisk: boolean;
  verifyRun: RunView | null;
  qcRun: RunView | null;
  mismatch: {
    verify: string | null;
    qc: string | null;
  };
  anomalies: string[];
  verifiedSummary: {
    overallConfidence: number | null;
    verifyTime: string | null;
  };
  qcSummary: {
    qcTime: string | null;
    qcScore: number | null;
    isQualified: boolean | null;
  };
  raw: {
    poiInit: Record<string, unknown> | null;
    poiVerified: Record<string, unknown> | null;
    poiQc: Record<string, unknown> | null;
  };
}

interface RunView {
  phase: AnalysisPhase;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  retryCount: number;
  attemptCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheTokens: number;
  totalCostUsd: number;
  sessionIds: string[];
  sessionCount: number;
  errorSummary: string | null;
}

export interface TaskListResult {
  total: number;
  page: number;
  pageSize: number;
  items: DashboardTaskItem[];
}

export interface TaskLogDetail {
  taskId: string;
  verifyRawLog: string;
  qcRawLog: string;
  verifySessionIds: string[];
  qcSessionIds: string[];
}

export interface ImportPayload {
  source: string;
  verifyExecutorLog?: string;
  verifyClaudeLog?: string;
  qcExecutorLog?: string;
  qcClaudeLog?: string;
}

export interface DashboardRepositoryPort {
  clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }>;
  insertImport(payload: ImportPayload, batchId: string, verifyCount: number, qcCount: number, totalRuns: number): Promise<void>;
  insertAggregatedRuns(batchId: string, rows: AggregatedTaskRun[]): Promise<void>;
  nextImportBatchId(): string;
  getFilterOptions(): Promise<DashboardFilterOptions>;
  getOverview(): Promise<DashboardOverview>;
  getTaskList(filters: DashboardFilters): Promise<TaskListResult>;
  getTaskLogDetail(taskId: string): Promise<TaskLogDetail>;
}

const DB_DIR = path.resolve(process.cwd(), "tmp");
const DB_PATH = path.join(DB_DIR, "big-poi-dashboard.sqlite");

const VERIFY_DONE = "已核实";
const VERIFY_MANUAL = "需人工核实";
const GLM_INPUT_PRICE_PER_MILLION = 4;
const GLM_OUTPUT_PRICE_PER_MILLION = 18;

function calcCostByTokens(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * GLM_INPUT_PRICE_PER_MILLION + (outputTokens / 1_000_000) * GLM_OUTPUT_PRICE_PER_MILLION;
}

function createDb(): Database.Database {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  return new Database(DB_PATH);
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function boolish(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "yes";
  }
  return false;
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function readSampleData(): SampleSeedRecord[] {
  const samplePath = path.resolve(process.cwd(), "example", "db_conf", "sample_data.json");
  const raw = fs.readFileSync(samplePath, "utf8");
  return JSON.parse(raw) as SampleSeedRecord[];
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS poi_init (
      task_id TEXT PRIMARY KEY,
      id TEXT,
      name TEXT,
      address TEXT,
      city TEXT,
      city_adcode TEXT,
      poi_type TEXT,
      verify_status TEXT,
      verify_priority TEXT,
      status INTEGER,
      x_coord REAL,
      y_coord REAL,
      updatetime TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS poi_verified (
      task_id TEXT PRIMARY KEY,
      verify_status TEXT,
      verify_result TEXT,
      overall_confidence REAL,
      verify_time TEXT,
      verification_notes TEXT,
      verify_info_json TEXT,
      evidence_record_json TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS poi_qc (
      task_id TEXT PRIMARY KEY,
      qc_status TEXT,
      quality_status TEXT,
      verify_result TEXT,
      is_manual_required INTEGER,
      qc_score INTEGER,
      has_risk INTEGER,
      is_qualified INTEGER,
      qc_time TEXT,
      qc_result_json TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS temp_task_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_batch_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      task_id TEXT NOT NULL,
      row_number INTEGER,
      worker_id TEXT,
      batch_id TEXT,
      status TEXT,
      started_at TEXT,
      ended_at TEXT,
      duration_ms INTEGER DEFAULT 0,
      attempt_count INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0,
      session_ids_json TEXT,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      total_model_duration_ms INTEGER DEFAULT 0,
      total_tool_calls INTEGER DEFAULT 0,
      total_tool_errors INTEGER DEFAULT 0,
      error_summary TEXT,
      raw_details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_temp_task_task_phase ON temp_task_analysis(task_id, phase);
    CREATE INDEX IF NOT EXISTS idx_temp_task_batch ON temp_task_analysis(import_batch_id);

    CREATE TABLE IF NOT EXISTS analysis_imports (
      import_batch_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      verify_executor_log TEXT,
      verify_claude_log TEXT,
      qc_executor_log TEXT,
      qc_claude_log TEXT,
      verify_task_count INTEGER DEFAULT 0,
      qc_task_count INTEGER DEFAULT 0,
      total_task_runs INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

function seedBusinessTables(db: Database.Database): void {
  const count = Number((db.prepare("SELECT COUNT(*) as count FROM poi_init").get() as { count: number }).count);
  if (count > 0) return;

  const sampleRows = readSampleData();
  const insertInit = db.prepare(`
    INSERT INTO poi_init (
      task_id,id,name,address,city,city_adcode,poi_type,verify_status,verify_priority,status,x_coord,y_coord,updatetime,raw_json
    ) VALUES (
      @task_id,@id,@name,@address,@city,@city_adcode,@poi_type,@verify_status,@verify_priority,@status,@x_coord,@y_coord,@updatetime,@raw_json
    )
  `);

  const insertVerified = db.prepare(`
    INSERT INTO poi_verified (
      task_id,verify_status,verify_result,overall_confidence,verify_time,verification_notes,verify_info_json,evidence_record_json,raw_json
    ) VALUES (
      @task_id,@verify_status,@verify_result,@overall_confidence,@verify_time,@verification_notes,@verify_info_json,@evidence_record_json,@raw_json
    )
  `);

  const insertQc = db.prepare(`
    INSERT INTO poi_qc (
      task_id,qc_status,quality_status,verify_result,is_manual_required,qc_score,has_risk,is_qualified,qc_time,qc_result_json,raw_json
    ) VALUES (
      @task_id,@qc_status,@quality_status,@verify_result,@is_manual_required,@qc_score,@has_risk,@is_qualified,@qc_time,@qc_result_json,@raw_json
    )
  `);

  const tx = db.transaction(() => {
    for (const item of sampleRows) {
      const init = item.poi_init ?? {};
      insertInit.run({
        task_id: init.task_id ?? null,
        id: init.id ?? null,
        name: init.name ?? null,
        address: init.address ?? null,
        city: init.city ?? null,
        city_adcode: init.city_adcode ?? null,
        poi_type: init.poi_type ?? null,
        verify_status: init.verify_status ?? null,
        verify_priority: init.verify_priority ?? null,
        status: init.status ?? null,
        x_coord: init.x_coord ?? null,
        y_coord: init.y_coord ?? null,
        updatetime: init.updatetime ?? null,
        raw_json: JSON.stringify(init),
      });

      if (item.poi_verified) {
        const verified = item.poi_verified;
        insertVerified.run({
          task_id: verified.task_id ?? null,
          verify_status: verified.verify_status ?? null,
          verify_result: verified.verify_result ?? null,
          overall_confidence: verified.overall_confidence ?? null,
          verify_time: verified.verify_time ?? null,
          verification_notes: verified.verification_notes ?? null,
          verify_info_json: verified.verify_info ? JSON.stringify(verified.verify_info) : null,
          evidence_record_json: verified.evidence_record ? JSON.stringify(verified.evidence_record) : null,
          raw_json: JSON.stringify(verified),
        });
      }

      if (item.poi_qc) {
        const qc = item.poi_qc;
        insertQc.run({
          task_id: qc.task_id ?? null,
          qc_status: qc.qc_status ?? null,
          quality_status: qc.quality_status ?? null,
          verify_result: qc.verify_result ?? null,
          is_manual_required: boolish(qc.is_manual_required) ? 1 : 0,
          qc_score: qc.qc_score ?? null,
          has_risk: boolish(qc.has_risk) ? 1 : 0,
          is_qualified: qc.is_qualified == null ? null : boolish(qc.is_qualified) ? 1 : 0,
          qc_time: qc.qc_time ?? null,
          qc_result_json: qc.qc_result ? JSON.stringify(qc.qc_result) : null,
          raw_json: JSON.stringify(qc),
        });
      }
    }
  });

  tx();
}

function mapRun(row: Record<string, unknown>, phase: AnalysisPhase): RunView | null {
  if (!row[`${phase}_task_id`]) return null;
  const sessionIds = safeJsonParse<string[]>(String(row[`${phase}_session_ids_json`] ?? "[]")) ?? [];
  const inputTokens = Number(row[`${phase}_total_input_tokens`] ?? 0);
  const outputTokens = Number(row[`${phase}_total_output_tokens`] ?? 0);
  const totalCost = calcCostByTokens(inputTokens, outputTokens);

  return {
    phase,
    status: String(row[phase === "qc" ? "qc_status_run" : `${phase}_status`] ?? "") || null,
    startedAt: (row[`${phase}_started_at`] as string | null) ?? null,
    endedAt: (row[`${phase}_ended_at`] as string | null) ?? null,
    durationMs: Number(row[`${phase}_duration_ms`] ?? 0),
    retryCount: Number(row[`${phase}_retry_count`] ?? 0),
    attemptCount: Number(row[`${phase}_attempt_count`] ?? 0),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheTokens: Number(row[`${phase}_total_cache_tokens`] ?? 0),
    totalCostUsd: totalCost,
    sessionIds,
    sessionCount: Number(row[`${phase}_session_count`] ?? 0),
    errorSummary: String(row[`${phase}_error_summary`] ?? "") || null,
  };
}

function buildTaskFilterSql(filters: DashboardFilters): { whereSql: string; params: Record<string, unknown> } {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  };
  const alertClauses: string[] = [];

  if (filters.search) {
    clauses.push("(task_id LIKE @search OR poi_id LIKE @search OR name LIKE @search OR address LIKE @search OR city LIKE @search)");
    params.search = `%${filters.search}%`;
  }

  if (filters.verifyStatus) {
    clauses.push("COALESCE(verified_status, init_verify_status, '') = @verifyStatus");
    params.verifyStatus = filters.verifyStatus;
  }

  if (filters.qcStatus) {
    clauses.push("COALESCE(NULLIF(quality_status, ''), NULLIF(qc_status, ''), '') = @qcStatus");
    params.qcStatus = filters.qcStatus;
  }

  if (filters.manualOnly) {
    clauses.push(`(COALESCE(verify_result, '') = '${VERIFY_MANUAL}' OR COALESCE(is_qualified, 0) <> 1)`);
  }

  if (filters.anomalyOnly) {
    clauses.push("COALESCE(has_anomaly, 0) = 1");
  }

  for (const tag of filters.alertTags) {
    if (tag === "核实阻塞异常") alertClauses.push("COALESCE(verify_retry_count, 0) > 5");
    if (tag === "核实执行异常") alertClauses.push("(verify_task_id IS NOT NULL AND COALESCE(verify_status, '') <> 'success' AND COALESCE(verify_retry_count, 0) <= 5)");
    if (tag === "质检阻塞异常") alertClauses.push("COALESCE(qc_retry_count, 0) > 5");
    if (tag === "质检执行异常") alertClauses.push("(qc_task_id IS NOT NULL AND COALESCE(qc_status_run, '') <> 'success' AND COALESCE(qc_retry_count, 0) <= 5)");
    if (tag === "需人工介入") alertClauses.push(`(COALESCE(verify_result, '') = '${VERIFY_MANUAL}' OR COALESCE(is_qualified, 0) <> 1)`);
    if (tag === "质检不通过") alertClauses.push("is_qualified = 0");
    if (tag === "高风险任务") alertClauses.push("(COALESCE(has_risk, 0) = 1 OR COALESCE(qc_status, '') = 'risky')");
    if (tag === "核实状态不一致") alertClauses.push("COALESCE(verify_mismatch_reason, '') != ''");
    if (tag === "质检状态不一致") alertClauses.push("COALESCE(qc_mismatch_reason, '') != ''");
  }

  if (alertClauses.length > 0) {
    clauses.push(`(${alertClauses.join(" OR ")})`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function normalizeTask(row: Record<string, unknown>): DashboardTaskItem {
  const verifyRun = mapRun(row, "verify");
  const qcRun = mapRun(row, "qc");

  const mismatchVerify = String(row.verify_mismatch_reason ?? "") || null;
  const mismatchQc = String(row.qc_mismatch_reason ?? "") || null;

  const item: DashboardTaskItem = {
    taskId: String(row.task_id),
    poiId: (row.poi_id as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    poiType: (row.poi_type as string | null) ?? null,
    initVerifyStatus: (row.init_verify_status as string | null) ?? null,
    verifiedStatus: (row.verified_status as string | null) ?? null,
    verifyResult: (row.verify_result as string | null) ?? null,
    qcStatus: (row.qc_status as string | null) ?? null,
    qualityStatus: (row.quality_status as string | null) ?? null,
    isManualRequired:
      (row.verify_result as string | null) === VERIFY_MANUAL ||
      (row.is_qualified == null ? false : !boolish(row.is_qualified)),
    hasRisk: boolish(row.has_risk),
    verifyRun,
    qcRun,
    mismatch: {
      verify: mismatchVerify,
      qc: mismatchQc,
    },
    anomalies: [],
    verifiedSummary: {
      overallConfidence: row.overall_confidence == null ? null : Number(row.overall_confidence),
      verifyTime: (row.verify_time as string | null) ?? null,
    },
    qcSummary: {
      qcTime: (row.qc_time as string | null) ?? null,
      qcScore: row.qc_score == null ? null : Number(row.qc_score),
      isQualified: row.is_qualified == null ? null : boolish(row.is_qualified),
    },
    raw: {
      poiInit: safeJsonParse<Record<string, unknown>>((row.poi_init_raw as string | null) ?? null),
      poiVerified: safeJsonParse<Record<string, unknown>>((row.poi_verified_raw as string | null) ?? null),
      poiQc: safeJsonParse<Record<string, unknown>>((row.poi_qc_raw as string | null) ?? null),
    },
  };

  if (mismatchVerify) item.anomalies.push(mismatchVerify);
  if (mismatchQc) item.anomalies.push(mismatchQc);
  if (!verifyRun && item.verifiedStatus) item.anomalies.push("数据库有核实状态，但日志侧未找到核实执行记录");
  if (!qcRun && item.qcStatus) item.anomalies.push("数据库有质检状态，但日志侧未找到质检执行记录");

  return item;
}

export class DashboardRepository implements DashboardRepositoryPort {
  private readonly db: Database.Database;

  constructor() {
    this.db = createDb();
    ensureSchema(this.db);
    seedBusinessTables(this.db);
  }

  async clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }> {
    const deleteRuns = this.db.prepare("DELETE FROM temp_task_analysis").run();
    const deleteImports = this.db.prepare("DELETE FROM analysis_imports").run();
    return { deletedRows: deleteRuns.changes, deletedImports: deleteImports.changes };
  }

  async insertImport(payload: ImportPayload, batchId: string, verifyCount: number, qcCount: number, totalRuns: number): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO analysis_imports (
          import_batch_id,source,verify_executor_log,verify_claude_log,qc_executor_log,qc_claude_log,
          verify_task_count,qc_task_count,total_task_runs,created_at
        ) VALUES (
          @import_batch_id,@source,@verify_executor_log,@verify_claude_log,@qc_executor_log,@qc_claude_log,
          @verify_task_count,@qc_task_count,@total_task_runs,@created_at
        )
      `)
      .run({
        import_batch_id: batchId,
        source: payload.source,
        verify_executor_log: payload.verifyExecutorLog ?? null,
        verify_claude_log: payload.verifyClaudeLog ?? null,
        qc_executor_log: payload.qcExecutorLog ?? null,
        qc_claude_log: payload.qcClaudeLog ?? null,
        verify_task_count: verifyCount,
        qc_task_count: qcCount,
        total_task_runs: totalRuns,
        created_at: toIsoNow(),
      });
  }

  async insertAggregatedRuns(batchId: string, rows: AggregatedTaskRun[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO temp_task_analysis (
        import_batch_id,phase,task_id,row_number,worker_id,batch_id,status,started_at,ended_at,duration_ms,
        attempt_count,retry_count,session_count,session_ids_json,total_input_tokens,total_output_tokens,total_cache_tokens,
        total_cost_usd,total_model_duration_ms,total_tool_calls,total_tool_errors,error_summary,raw_details_json,created_at
      ) VALUES (
        @import_batch_id,@phase,@task_id,@row_number,@worker_id,@batch_id,@status,@started_at,@ended_at,@duration_ms,
        @attempt_count,@retry_count,@session_count,@session_ids_json,@total_input_tokens,@total_output_tokens,@total_cache_tokens,
        @total_cost_usd,@total_model_duration_ms,@total_tool_calls,@total_tool_errors,@error_summary,@raw_details_json,@created_at
      )
    `);

    const tx = this.db.transaction((records: AggregatedTaskRun[]) => {
      const createdAt = toIsoNow();
      for (const row of records) {
        stmt.run({
          import_batch_id: batchId,
          phase: row.phase,
          task_id: row.taskId,
          row_number: row.rowNumber,
          worker_id: row.workerId,
          batch_id: row.batchId,
          status: row.status,
          started_at: row.startedAt,
          ended_at: row.endedAt,
          duration_ms: row.durationMs,
          attempt_count: row.attemptCount,
          retry_count: row.retryCount,
          session_count: row.sessionCount,
          session_ids_json: JSON.stringify(row.sessionIds),
          total_input_tokens: row.totalInputTokens,
          total_output_tokens: row.totalOutputTokens,
          total_cache_tokens: row.totalCacheTokens,
          total_cost_usd: row.totalCostUsd,
          total_model_duration_ms: row.totalModelDurationMs,
          total_tool_calls: row.totalToolCalls,
          total_tool_errors: row.totalToolErrors,
          error_summary: row.errorSummary,
          raw_details_json: JSON.stringify(row.rawDetails),
          created_at: createdAt,
        });
      }
    });

    tx(rows);
  }

  nextImportBatchId(): string {
    return `IMPORT_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  private async latestImport(): Promise<ImportSnapshot | null> {
    const row = this.db
      .prepare(
        "SELECT source,verify_task_count,qc_task_count,total_task_runs,created_at FROM analysis_imports ORDER BY created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      importedAt: String(row.created_at),
      source: String(row.source),
      verifyTaskCount: Number(row.verify_task_count ?? 0),
      qcTaskCount: Number(row.qc_task_count ?? 0),
      totalTaskRuns: Number(row.total_task_runs ?? 0),
    };
  }

  async getFilterOptions(): Promise<DashboardFilterOptions> {
    const verifyStatuses = (
      this.db
        .prepare(
          `
            SELECT DISTINCT COALESCE(v.verify_status, i.verify_status, '') as status
            FROM poi_init i
            LEFT JOIN poi_verified v ON v.task_id = i.task_id
            WHERE COALESCE(v.verify_status, i.verify_status, '') != ''
            ORDER BY status
          `,
        )
        .all() as Array<{ status: string }>
    ).map((row) => row.status);

    const qcStatuses = (
      this.db
        .prepare(`
          SELECT DISTINCT COALESCE(NULLIF(quality_status, ''), NULLIF(qc_status, ''), '') as status
          FROM poi_qc
          WHERE COALESCE(NULLIF(quality_status, ''), NULLIF(qc_status, ''), '') != ''
          ORDER BY status
        `)
        .all() as Array<{ status: string }>
    ).map((row) => row.status);

    return { verifyStatuses, qcStatuses };
  }

  async getOverview(): Promise<DashboardOverview> {
    const totalTasks = Number((this.db.prepare("SELECT COUNT(*) as count FROM poi_init").get() as { count: number }).count);

    const verifyStatusCounts = (
      this.db
        .prepare("SELECT COALESCE(verify_status,'未知状态') as status, COUNT(*) as count FROM poi_init GROUP BY verify_status ORDER BY count DESC")
        .all() as Array<{ status: string; count: number }>
    ).map((item) => ({ status: item.status, count: Number(item.count) }));

    const flowStageCounts = (
      this.db
        .prepare(`
          WITH latest AS (
            SELECT *
            FROM temp_task_analysis
            WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
          ),
          verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
          qc_runs AS (SELECT * FROM latest WHERE phase = 'qc')
          SELECT
            CASE
              WHEN q.is_qualified IS NOT NULL
                OR COALESCE(q.quality_status, '') = '已质检'
                OR COALESCE(q.qc_status, '') != ''
              THEN 'qc_done'
              WHEN qr.task_id IS NOT NULL
                OR COALESCE(q.quality_status, '') = '质检中'
              THEN 'qc_running'
              WHEN vr.status = 'success'
                OR COALESCE(v.verify_status, '') != ''
                OR COALESCE(v.verify_result, '') != ''
              THEN 'verified_waiting_qc'
              WHEN vr.task_id IS NOT NULL
              THEN 'verifying'
              ELSE 'pending_verify'
            END AS stage,
            COUNT(*) AS count
          FROM poi_init i
          LEFT JOIN poi_verified v ON v.task_id = i.task_id
          LEFT JOIN poi_qc q ON q.task_id = i.task_id
          LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
          LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
          GROUP BY stage
        `)
        .all() as Array<{ stage: string; count: number }>
    ).map((item) => ({ stage: item.stage, count: Number(item.count) }));

    const metricsRows = this.db
      .prepare(`
        WITH latest AS (
          SELECT *
          FROM temp_task_analysis
          WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
        )
        SELECT phase,
               COUNT(*) as task_count,
               SUM(duration_ms) as total_duration_ms,
               SUM(total_input_tokens) as total_input_tokens,
               SUM(total_output_tokens) as total_output_tokens,
               SUM(total_input_tokens + total_output_tokens) as total_tokens,
               SUM(
                 (COALESCE(total_input_tokens, 0) / 1000000.0) * ${GLM_INPUT_PRICE_PER_MILLION}
                 + (COALESCE(total_output_tokens, 0) / 1000000.0) * ${GLM_OUTPUT_PRICE_PER_MILLION}
               ) as total_cost_usd,
               AVG(duration_ms) as avg_duration_ms,
               AVG(total_input_tokens) as avg_input_tokens,
               AVG(total_output_tokens) as avg_output_tokens,
               AVG(total_input_tokens + total_output_tokens) as avg_total_tokens,
               AVG(
                 (COALESCE(total_input_tokens, 0) / 1000000.0) * ${GLM_INPUT_PRICE_PER_MILLION}
                 + (COALESCE(total_output_tokens, 0) / 1000000.0) * ${GLM_OUTPUT_PRICE_PER_MILLION}
               ) as avg_cost_usd
        FROM latest
        GROUP BY phase
      `)
      .all() as Array<Record<string, unknown>>;

    const empty: Metrics = {
      taskCount: 0,
      totalDurationMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      automationRate: 0,
      verificationQualityRate: 0,
      avgDurationMs: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      avgTotalTokens: 0,
      avgCostUsd: 0,
    };

    const verifyMetrics = { ...empty };
    const qcMetrics = { ...empty };

    for (const row of metricsRows) {
      const metric: Metrics = {
        taskCount: Number(row.task_count ?? 0),
        totalDurationMs: Number(row.total_duration_ms ?? 0),
        totalInputTokens: Number(row.total_input_tokens ?? 0),
        totalOutputTokens: Number(row.total_output_tokens ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        totalCostUsd: Number(row.total_cost_usd ?? 0),
        automationRate: 0,
        verificationQualityRate: 0,
        avgDurationMs: Number(row.avg_duration_ms ?? 0),
        avgInputTokens: Number(row.avg_input_tokens ?? 0),
        avgOutputTokens: Number(row.avg_output_tokens ?? 0),
        avgTotalTokens: Number(row.avg_total_tokens ?? 0),
        avgCostUsd: Number(row.avg_cost_usd ?? 0),
      };

      if (row.phase === "verify") Object.assign(verifyMetrics, metric);
      if (row.phase === "qc") Object.assign(qcMetrics, metric);
    }

    // 自动化率 = 1 - (需人工核实 / 总核实数量)
    // 口径：核实结果字段使用 poi_verified.verify_result
    const verifyRateRow = this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN COALESCE(verify_result, '') = '需人工核实' THEN 1 ELSE 0 END) AS manual_count,
          SUM(CASE WHEN COALESCE(verify_result, '') != '' THEN 1 ELSE 0 END) AS verified_total
        FROM poi_verified
      `)
      .get() as { manual_count: number | null; verified_total: number | null };
    const verifiedTotal = Number(verifyRateRow.verified_total ?? 0);
    const manualCount = Number(verifyRateRow.manual_count ?? 0);
    verifyMetrics.automationRate = verifiedTotal > 0 ? Math.max(0, 1 - manualCount / verifiedTotal) : 0;

    // 核实质量 = (
    //   (verify_result='核实通过' AND is_qualified=1)
    //   +
    //   (verify_result='需人工核实' AND is_qualified!=1)
    // ) / 已质检总量
    // 口径：只统计“核实且已质检”任务在分子中的命中；分母为已质检数量。
    const qualityRow = this.db
      .prepare(`
        SELECT
          SUM(
            CASE
              WHEN COALESCE(v.verify_result, '') = '核实通过' AND q.is_qualified = 1 THEN 1
              WHEN COALESCE(v.verify_result, '') = '需人工核实' AND COALESCE(q.is_qualified, 0) != 1 THEN 1
              ELSE 0
            END
          ) AS matched_count,
          SUM(CASE WHEN q.is_qualified IS NOT NULL THEN 1 ELSE 0 END) AS qc_total
        FROM poi_qc q
        LEFT JOIN poi_verified v ON v.task_id = q.task_id
      `)
      .get() as { matched_count: number | null; qc_total: number | null };
    const qualityMatched = Number(qualityRow.matched_count ?? 0);
    const qcTotal = Number(qualityRow.qc_total ?? 0);
    qcMetrics.verificationQualityRate = qcTotal > 0 ? qualityMatched / qcTotal : 0;

    const manualTaskCount = Number(
      (
        this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM poi_init i
            LEFT JOIN poi_verified v ON v.task_id = i.task_id
            LEFT JOIN poi_qc q ON q.task_id = i.task_id
            WHERE COALESCE(v.verify_result, '') = '${VERIFY_MANUAL}'
               OR COALESCE(q.is_qualified, 0) <> 1
          `)
          .get() as { count: number }
      ).count,
    );

    const anomalyCount = Number(
      (
        this.db
          .prepare(`
            WITH latest AS (
              SELECT *
              FROM temp_task_analysis
              WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
            ),
            verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
            qc_runs AS (SELECT * FROM latest WHERE phase = 'qc')
            SELECT COUNT(*) as count
            FROM poi_init i
            LEFT JOIN poi_verified v ON v.task_id = i.task_id
            LEFT JOIN poi_qc q ON q.task_id = i.task_id
            LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
            LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
            WHERE (
              vr.task_id IS NOT NULL
              AND v.verify_status IS NOT NULL
              AND (
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
              )
            )
            OR (
              qr.task_id IS NOT NULL
              AND q.qc_status IS NOT NULL
              AND qr.status <> 'success'
            )
          `)
          .get() as { count: number }
      ).count,
    );

    const qcRejectedCount = Number(
      (
        this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM poi_qc
            WHERE is_qualified = 0
          `)
          .get() as { count: number }
      ).count,
    );

    return {
      totalTasks,
      verifyStatusCounts,
      flowStageCounts,
      verifyMetrics,
      qcMetrics,
      manualMonitoring: {
        manualTaskCount,
        anomalyCount,
        qcRejectedCount,
        latestImport: await this.latestImport(),
      },
    };
  }

  async getTaskList(filters: DashboardFilters): Promise<TaskListResult> {
    const { whereSql, params } = buildTaskFilterSql(filters);

    const baseSql = `
      WITH latest AS (
        SELECT *
        FROM temp_task_analysis
        WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
      ),
      verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
      qc_runs AS (SELECT * FROM latest WHERE phase = 'qc'),
      merged AS (
        SELECT
          i.task_id,
          i.id AS poi_id,
          i.name,
          i.city,
          i.address,
          i.poi_type,
          i.verify_status AS init_verify_status,
          i.raw_json AS poi_init_raw,

          v.verify_status AS verified_status,
          v.verify_result,
          v.overall_confidence,
          v.verify_time,
          v.raw_json AS poi_verified_raw,

          q.qc_status,
          q.quality_status,
          q.is_manual_required,
          q.qc_score,
          q.has_risk,
          q.is_qualified,
          q.qc_time,
          q.raw_json AS poi_qc_raw,

          vr.task_id AS verify_task_id,
          vr.status AS verify_status,
          vr.started_at AS verify_started_at,
          vr.ended_at AS verify_ended_at,
          vr.duration_ms AS verify_duration_ms,
          vr.retry_count AS verify_retry_count,
          vr.attempt_count AS verify_attempt_count,
          vr.total_input_tokens AS verify_total_input_tokens,
          vr.total_output_tokens AS verify_total_output_tokens,
          vr.total_cache_tokens AS verify_total_cache_tokens,
          vr.total_cost_usd AS verify_total_cost_usd,
          vr.session_count AS verify_session_count,
          vr.session_ids_json AS verify_session_ids_json,
          vr.error_summary AS verify_error_summary,

          qr.task_id AS qc_task_id,
          qr.status AS qc_status_run,
          qr.started_at AS qc_started_at,
          qr.ended_at AS qc_ended_at,
          qr.duration_ms AS qc_duration_ms,
          qr.retry_count AS qc_retry_count,
          qr.attempt_count AS qc_attempt_count,
          qr.total_input_tokens AS qc_total_input_tokens,
          qr.total_output_tokens AS qc_total_output_tokens,
          qr.total_cache_tokens AS qc_total_cache_tokens,
          qr.total_cost_usd AS qc_total_cost_usd,
          qr.session_count AS qc_session_count,
          qr.session_ids_json AS qc_session_ids_json,
          qr.error_summary AS qc_error_summary,

          CASE
            WHEN vr.task_id IS NOT NULL
              AND v.verify_status IS NOT NULL
              AND (
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
              )
            THEN ('日志状态(' || COALESCE(vr.status,'unknown') || ') 与数据库核实状态(' || COALESCE(v.verify_status,'') || ') 不一致')
            ELSE NULL
          END AS verify_mismatch_reason,

          CASE
            WHEN qr.task_id IS NOT NULL
              AND q.qc_status IS NOT NULL
              AND qr.status <> 'success'
            THEN ('日志状态(' || COALESCE(qr.status,'unknown') || ') 与数据库质检状态(' || COALESCE(q.qc_status,'') || ') 不一致')
            ELSE NULL
          END AS qc_mismatch_reason,

          CASE
            WHEN (
              (vr.task_id IS NOT NULL AND v.verify_status IS NOT NULL AND (
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}'))
              ))
              OR (qr.task_id IS NOT NULL AND q.qc_status IS NOT NULL AND qr.status <> 'success')
            ) THEN 1
            ELSE 0
          END AS has_anomaly
        FROM poi_init i
        LEFT JOIN poi_verified v ON v.task_id = i.task_id
        LEFT JOIN poi_qc q ON q.task_id = i.task_id
        LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
        LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
      )
      SELECT * FROM merged
      ${whereSql}
    `;

    const total = Number((this.db.prepare(`SELECT COUNT(*) as count FROM (${baseSql}) t`).get(params) as { count: number }).count);

    const rows = this.db
      .prepare(`${baseSql} ORDER BY task_id LIMIT @limit OFFSET @offset`)
      .all(params) as Array<Record<string, unknown>>;

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: rows.map(normalizeTask),
    };
  }

  async getTaskLogDetail(taskId: string): Promise<TaskLogDetail> {
    const runRows = this.db
      .prepare(`
        SELECT phase, session_ids_json, import_batch_id
        FROM temp_task_analysis
        WHERE task_id = ?
          AND id IN (
            SELECT MAX(id)
            FROM temp_task_analysis
            WHERE task_id = ?
            GROUP BY task_id, phase
          )
      `)
      .all(taskId, taskId) as Array<Record<string, unknown>>;

    const verifyImportBatchId = String(runRows.find((row) => row.phase === "verify")?.import_batch_id ?? "") || null;
    const qcImportBatchId = String(runRows.find((row) => row.phase === "qc")?.import_batch_id ?? "") || null;
    const verifyImportRow = verifyImportBatchId
      ? (this.db.prepare("SELECT verify_claude_log FROM analysis_imports WHERE import_batch_id = ? LIMIT 1").get(verifyImportBatchId) as Record<string, unknown> | undefined)
      : undefined;
    const qcImportRow = qcImportBatchId
      ? (this.db.prepare("SELECT qc_claude_log FROM analysis_imports WHERE import_batch_id = ? LIMIT 1").get(qcImportBatchId) as Record<string, unknown> | undefined)
      : undefined;

    const verifySessionIds =
      safeJsonParse<string[]>(String(runRows.find((row) => row.phase === "verify")?.session_ids_json ?? "[]")) ?? [];
    const qcSessionIds =
      safeJsonParse<string[]>(String(runRows.find((row) => row.phase === "qc")?.session_ids_json ?? "[]")) ?? [];

    const filterBySessions = (rawLog: string, sessionIds: string[]): string => {
      if (!rawLog) return "";
      if (sessionIds.length === 0) return rawLog;
      const sessionSet = new Set(sessionIds);
      const lines = rawLog.split(/\r?\n/);
      const filtered = lines
        .filter((line) => {
          for (const sessionId of sessionSet) {
            if (line.includes(`"session_id":"${sessionId}"`) || line.includes(`"session_id": "${sessionId}"`)) {
              return true;
            }
          }
          return false;
        })
        .join("\n");
      return filtered.trim() ? filtered : rawLog;
    };

    return {
      taskId,
      verifyRawLog: filterBySessions(String(verifyImportRow?.verify_claude_log ?? ""), verifySessionIds),
      qcRawLog: filterBySessions(String(qcImportRow?.qc_claude_log ?? ""), qcSessionIds),
      verifySessionIds,
      qcSessionIds,
    };
  }
}
