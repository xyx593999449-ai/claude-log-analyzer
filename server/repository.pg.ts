import { Pool, type PoolClient } from "pg";
import type { AggregatedTaskRun, AnalysisPhase, DashboardFilters, ImportSnapshot } from "./types";
import type {
  DashboardFilterOptions,
  DashboardOverview,
  DashboardRepositoryPort,
  DashboardTaskItem,
  ImportPayload,
  TaskListResult,
  TaskLogDetail,
} from "./repository";
import type { PgDbConfig } from "./pgConfig";

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

const VERIFY_DONE = "已核实";
const VERIFY_MANUAL = "需人工核实";
const GLM_INPUT_PRICE_PER_MILLION = 4;
const GLM_OUTPUT_PRICE_PER_MILLION = 18;

function calcCostByTokens(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * GLM_INPUT_PRICE_PER_MILLION + (outputTokens / 1_000_000) * GLM_OUTPUT_PRICE_PER_MILLION;
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
    isManualRequired: boolish(row.is_manual_required) || (row.verified_status as string | null) === VERIFY_MANUAL,
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

function buildTaskFilterSqlPg(filters: DashboardFilters): { whereSql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.search) {
    clauses.push(
      `(i.task_id ILIKE $${idx} OR i.id ILIKE $${idx} OR i.name ILIKE $${idx} OR i.address ILIKE $${idx} OR i.city ILIKE $${idx})`,
    );
    params.push(`%${filters.search}%`);
    idx += 1;
  }

  if (filters.verifyStatus) {
    clauses.push(`COALESCE(v.verify_status, i.verify_status, '') = $${idx}`);
    params.push(filters.verifyStatus);
    idx += 1;
  }

  if (filters.qcStatus) {
    clauses.push(`COALESCE(q.qc_status, '') = $${idx}`);
    params.push(filters.qcStatus);
    idx += 1;
  }

  if (filters.manualOnly) {
    clauses.push(`(COALESCE(q.is_manual_required, 0) = 1 OR COALESCE(v.verify_status, '') = '${VERIFY_MANUAL}')`);
  }

  if (filters.anomalyOnly) {
    clauses.push("COALESCE(has_anomaly, 0) = 1");
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export class PgDashboardRepository implements DashboardRepositoryPort {
  private readonly pool: Pool;
  private readonly initPromise: Promise<void>;
  private initError: Error | null = null;

  constructor(config: PgDbConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30000,
    });
    this.initPromise = this.ensureSchema().catch((error) => {
      this.initError = error instanceof Error ? error : new Error(String(error));
    });
  }

  private async ready(): Promise<void> {
    await this.initPromise;
    if (this.initError) {
      throw new Error(`PostgreSQL 初始化失败: ${this.initError.message}`);
    }
  }

  private async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS temp_task_analysis (
        id BIGSERIAL PRIMARY KEY,
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
        total_input_tokens BIGINT DEFAULT 0,
        total_output_tokens BIGINT DEFAULT 0,
        total_cache_tokens BIGINT DEFAULT 0,
        total_cost_usd DOUBLE PRECISION DEFAULT 0,
        total_model_duration_ms BIGINT DEFAULT 0,
        total_tool_calls BIGINT DEFAULT 0,
        total_tool_errors BIGINT DEFAULT 0,
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

  async clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }> {
    await this.ready();
    const deletedRows = await this.pool.query("DELETE FROM temp_task_analysis");
    const deletedImports = await this.pool.query("DELETE FROM analysis_imports");
    return { deletedRows: deletedRows.rowCount ?? 0, deletedImports: deletedImports.rowCount ?? 0 };
  }

  async insertImport(payload: ImportPayload, batchId: string, verifyCount: number, qcCount: number, totalRuns: number): Promise<void> {
    await this.ready();
    await this.pool.query(
      `
      INSERT INTO analysis_imports (
        import_batch_id,source,verify_executor_log,verify_claude_log,qc_executor_log,qc_claude_log,
        verify_task_count,qc_task_count,total_task_runs,created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        batchId,
        payload.source,
        payload.verifyExecutorLog ?? null,
        payload.verifyClaudeLog ?? null,
        payload.qcExecutorLog ?? null,
        payload.qcClaudeLog ?? null,
        verifyCount,
        qcCount,
        totalRuns,
        toIsoNow(),
      ],
    );
  }

  async insertAggregatedRuns(batchId: string, rows: AggregatedTaskRun[]): Promise<void> {
    await this.ready();
    if (rows.length === 0) return;

    await this.withTx(async (client) => {
      const createdAt = toIsoNow();
      for (const row of rows) {
        await client.query(
          `
          INSERT INTO temp_task_analysis (
            import_batch_id,phase,task_id,row_number,worker_id,batch_id,status,started_at,ended_at,duration_ms,
            attempt_count,retry_count,session_count,session_ids_json,total_input_tokens,total_output_tokens,total_cache_tokens,
            total_cost_usd,total_model_duration_ms,total_tool_calls,total_tool_errors,error_summary,raw_details_json,created_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,$22,$23,$24
          )
          `,
          [
            batchId,
            row.phase,
            row.taskId,
            row.rowNumber,
            row.workerId,
            row.batchId,
            row.status,
            row.startedAt,
            row.endedAt,
            row.durationMs,
            row.attemptCount,
            row.retryCount,
            row.sessionCount,
            JSON.stringify(row.sessionIds),
            row.totalInputTokens,
            row.totalOutputTokens,
            row.totalCacheTokens,
            row.totalCostUsd,
            row.totalModelDurationMs,
            row.totalToolCalls,
            row.totalToolErrors,
            row.errorSummary,
            JSON.stringify(row.rawDetails),
            createdAt,
          ],
        );
      }
    });
  }

  nextImportBatchId(): string {
    return `IMPORT_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  private async latestImport(): Promise<ImportSnapshot | null> {
    const result = await this.pool.query(
      "SELECT source,verify_task_count,qc_task_count,total_task_runs,created_at FROM analysis_imports ORDER BY created_at DESC LIMIT 1",
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
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
    await this.ready();
    const verifyStatusesRes = await this.pool.query(
      "SELECT DISTINCT COALESCE(verify_status,'') as status FROM poi_init WHERE verify_status IS NOT NULL AND verify_status != '' ORDER BY verify_status",
    );
    const qcStatusesRes = await this.pool.query(
      "SELECT DISTINCT COALESCE(qc_status,'') as status FROM poi_qc WHERE qc_status IS NOT NULL AND qc_status != '' ORDER BY qc_status",
    );
    return {
      verifyStatuses: verifyStatusesRes.rows.map((row) => String(row.status)),
      qcStatuses: qcStatusesRes.rows.map((row) => String(row.status)),
    };
  }

  async getOverview(): Promise<DashboardOverview> {
    await this.ready();
    const totalTasksRes = await this.pool.query("SELECT COUNT(*)::bigint as count FROM poi_init");
    const totalTasks = Number(totalTasksRes.rows[0]?.count ?? 0);

    const verifyStatusCountsRes = await this.pool.query(
      "SELECT COALESCE(verify_status,'未知状态') as status, COUNT(*)::bigint as count FROM poi_init GROUP BY verify_status ORDER BY count DESC",
    );
    const verifyStatusCounts = verifyStatusCountsRes.rows.map((item) => ({
      status: String(item.status),
      count: Number(item.count ?? 0),
    }));

    const metricsRowsRes = await this.pool.query(`
      WITH latest AS (
        SELECT *
        FROM temp_task_analysis
        WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
      )
      SELECT phase,
             COUNT(*)::bigint as task_count,
             SUM(duration_ms)::bigint as total_duration_ms,
             SUM(total_input_tokens)::bigint as total_input_tokens,
             SUM(total_output_tokens)::bigint as total_output_tokens,
             SUM(total_input_tokens + total_output_tokens)::bigint as total_tokens,
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
    `);

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

    for (const row of metricsRowsRes.rows as Array<Record<string, unknown>>) {
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

    const verifyRateRes = await this.pool.query(`
      SELECT
        SUM(CASE WHEN COALESCE(verify_result, '') = '需人工核实' THEN 1 ELSE 0 END)::bigint AS manual_count,
        SUM(CASE WHEN COALESCE(verify_result, '') != '' THEN 1 ELSE 0 END)::bigint AS verified_total
      FROM poi_verified
    `);
    const verifyRateRow = verifyRateRes.rows[0] as Record<string, unknown>;
    const verifiedTotal = Number(verifyRateRow?.verified_total ?? 0);
    const manualCount = Number(verifyRateRow?.manual_count ?? 0);
    verifyMetrics.automationRate = verifiedTotal > 0 ? Math.max(0, 1 - manualCount / verifiedTotal) : 0;

    const qualityRes = await this.pool.query(`
      SELECT
        SUM(
          CASE
            WHEN COALESCE(v.verify_result, '') = '核实通过' AND q.is_qualified = 1 THEN 1
            WHEN COALESCE(v.verify_result, '') = '需人工核实' AND COALESCE(q.is_qualified, 0) != 1 THEN 1
            ELSE 0
          END
        )::bigint AS matched_count,
        SUM(CASE WHEN q.is_qualified IS NOT NULL THEN 1 ELSE 0 END)::bigint AS qc_total
      FROM poi_qc q
      LEFT JOIN poi_verified v ON v.task_id = q.task_id
    `);
    const qualityRow = qualityRes.rows[0] as Record<string, unknown>;
    const qualityMatched = Number(qualityRow?.matched_count ?? 0);
    const qcTotal = Number(qualityRow?.qc_total ?? 0);
    qcMetrics.verificationQualityRate = qcTotal > 0 ? qualityMatched / qcTotal : 0;

    const manualTaskCountRes = await this.pool.query(`
      SELECT COUNT(*)::bigint as count
      FROM poi_init i
      LEFT JOIN poi_verified v ON v.task_id = i.task_id
      LEFT JOIN poi_qc q ON q.task_id = i.task_id
      WHERE COALESCE(q.is_manual_required, 0) = 1 OR COALESCE(v.verify_status, '') = '${VERIFY_MANUAL}'
    `);
    const manualTaskCount = Number(manualTaskCountRes.rows[0]?.count ?? 0);

    const anomalyCountRes = await this.pool.query(`
      WITH latest AS (
        SELECT *
        FROM temp_task_analysis
        WHERE id IN (SELECT MAX(id) FROM temp_task_analysis GROUP BY task_id, phase)
      ),
      verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
      qc_runs AS (SELECT * FROM latest WHERE phase = 'qc')
      SELECT COUNT(*)::bigint as count
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
    `);
    const anomalyCount = Number(anomalyCountRes.rows[0]?.count ?? 0);

    return {
      totalTasks,
      verifyStatusCounts,
      verifyMetrics,
      qcMetrics,
      manualMonitoring: {
        manualTaskCount,
        anomalyCount,
        latestImport: await this.latestImport(),
      },
    };
  }

  async getTaskList(filters: DashboardFilters): Promise<TaskListResult> {
    await this.ready();
    const { whereSql, params } = buildTaskFilterSqlPg(filters);

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
          to_jsonb(i)::text AS poi_init_raw,

          v.verify_status AS verified_status,
          v.verify_result,
          v.overall_confidence,
          v.verify_time::text as verify_time,
          to_jsonb(v)::text AS poi_verified_raw,

          q.qc_status,
          q.quality_status,
          q.is_manual_required,
          q.qc_score,
          q.has_risk,
          q.is_qualified,
          q.qc_time::text as qc_time,
          to_jsonb(q)::text AS poi_qc_raw,

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

    const totalRes = await this.pool.query(`SELECT COUNT(*)::bigint as count FROM (${baseSql}) t`, params);
    const total = Number(totalRes.rows[0]?.count ?? 0);

    const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    const rowsRes = await this.pool.query(
      `${baseSql} ORDER BY task_id LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      pageParams,
    );

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: (rowsRes.rows as Array<Record<string, unknown>>).map(normalizeTask),
    };
  }

  async getTaskLogDetail(taskId: string): Promise<TaskLogDetail> {
    await this.ready();
    const latestImportRes = await this.pool.query("SELECT * FROM analysis_imports ORDER BY created_at DESC LIMIT 1");
    const latestImportRow = latestImportRes.rows[0] as Record<string, unknown> | undefined;

    const runRowsRes = await this.pool.query(
      `
      SELECT phase, session_ids_json
      FROM temp_task_analysis
      WHERE task_id = $1
        AND id IN (
          SELECT MAX(id)
          FROM temp_task_analysis
          WHERE task_id = $1
          GROUP BY task_id, phase
        )
      `,
      [taskId],
    );

    const runRows = runRowsRes.rows as Array<Record<string, unknown>>;
    const verifySessionIds =
      safeJsonParse<string[]>(String(runRows.find((row) => row.phase === "verify")?.session_ids_json ?? "[]")) ?? [];
    const qcSessionIds =
      safeJsonParse<string[]>(String(runRows.find((row) => row.phase === "qc")?.session_ids_json ?? "[]")) ?? [];

    const filterBySessions = (rawLog: string, sessionIds: string[]): string => {
      if (!rawLog || sessionIds.length === 0) return "";
      const sessionSet = new Set(sessionIds);
      const lines = rawLog.split(/\r?\n/);
      return lines
        .filter((line) => {
          for (const sessionId of sessionSet) {
            if (line.includes(`"session_id":"${sessionId}"`) || line.includes(`"session_id": "${sessionId}"`)) {
              return true;
            }
          }
          return false;
        })
        .join("\n");
    };

    return {
      taskId,
      verifyRawLog: filterBySessions(String(latestImportRow?.verify_claude_log ?? ""), verifySessionIds),
      qcRawLog: filterBySessions(String(latestImportRow?.qc_claude_log ?? ""), qcSessionIds),
      verifySessionIds,
      qcSessionIds,
    };
  }
}
