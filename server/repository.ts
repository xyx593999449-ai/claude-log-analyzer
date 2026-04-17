import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  AggregatedTaskRun,
  AnalysisPhase,
  BatchOverviewItem,
  DashboardFilters,
  DashboardTimeGranularity,
  HitlDecisionReasonItem,
  HitlFlowStep,
  HitlIterationDecisionOverview,
  HitlIssueTaskDetail,
  HitlIssueTaskListItem,
  HitlIterationDetail,
  HitlIterationRegressionOverview,
  HitlIterationListItem,
  HitlModificationItem,
  HitlPromptItem,
  HitlRegressionDetailResponse,
  HitlRegressionDiffDirection,
  HitlRegressionDiffRow,
  HitlRegressionFieldDiff,
  HitlRegressionSampleDetail,
  HitlRegressionSummary,
  HitlRegressionSummaryCard,
  HitlRegressionRunItem,
  HitlRegressionType,
  HitlRootCauseItem,
  ImportSnapshot,
  SampleSeedRecord,
} from "./types";

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
  timeSeries: Array<{ timeBlock: string; verifyCount: number; qcCount: number }>;
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
  latestActionTime: string | null;
  latestActionType: "qc" | "verify" | "init" | null;
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

interface RegressionRunSummaryRow {
  batch_id?: unknown;
  dataset_name?: unknown;
  updatetime?: unknown;
  timestamp_suffix?: unknown;
  total_count?: unknown;
  positive_count?: unknown;
  negative_count?: unknown;
  verify_better_ratio?: unknown;
  verify_worsen_ratio?: unknown;
  qc_better_ratio?: unknown;
  qc_worsen_ratio?: unknown;
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
  verifySummary: TaskLogPhaseSummary;
  qcSummary: TaskLogPhaseSummary;
}

export interface TaskLogPhaseSummary {
  startedAt: string | null;
  endedAt: string | null;
  businessTime: string | null;
  durationMs: number;
  status: string | null;
}

export interface ImportPayload {
  source: string;
  verifyExecutorLog?: string;
  verifyClaudeLog?: string;
  qcExecutorLog?: string;
  qcClaudeLog?: string;
}

export interface DashboardRepositoryPort {
  /*
  注释废除的写入及清理方法
  clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }>;
  insertImport(payload: ImportPayload, batchId: string, verifyCount: number, qcCount: number, totalRuns: number): Promise<void>;
  insertAggregatedRuns(batchId: string, rows: AggregatedTaskRun[]): Promise<void>;
  */
  nextImportBatchId(): string;
  getFilterOptions(): Promise<DashboardFilterOptions>;
  getOverview(
    batches?: string[],
    startTime?: string,
    endTime?: string,
    granularity?: DashboardTimeGranularity,
  ): Promise<DashboardOverview>;
  getTaskList(filters: DashboardFilters): Promise<TaskListResult>;
  getTaskLogDetail(taskId: string): Promise<TaskLogDetail>;
  getBatches(): Promise<BatchOverviewItem[]>;
  getHitlIterations(): Promise<{ items: HitlIterationListItem[] }>;
  getHitlIterationDetail(batchId: string): Promise<HitlIterationDetail | null>;
  getHitlRegressionRuns(batchId: string): Promise<{ items: HitlRegressionRunItem[] }>;
  getHitlRegressionDetail(
    batchId: string,
    regressionType: HitlRegressionType,
    runId?: string,
    datasetName?: string,
    runAt?: string,
  ): Promise<HitlRegressionDetailResponse | null>;
  getHitlRegressionSampleDetail(
    batchId: string,
    regressionType: HitlRegressionType,
    sampleId: string,
    runId?: string,
    datasetName?: string,
    runAt?: string,
    taskId?: string,
  ): Promise<HitlRegressionSampleDetail | null>;
  getHitlIssueTasks(batchId: string, issueType: string): Promise<{ items: HitlIssueTaskListItem[] }>;
  getHitlIssueTaskDetail(batchId: string, issueType: string, taskId: string): Promise<HitlIssueTaskDetail | null>;
  hasInitError(): boolean;
}

const DB_DIR = path.resolve(process.cwd(), "tmp");
const DB_PATH = path.join(DB_DIR, "big-poi-dashboard.sqlite");

const VERIFY_DONE = "已核实";
const VERIFY_MANUAL = "需人工核实";
const VERIFY_BATCH_CREATED = "生成批次";
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

function normalizeNullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase() === "nan" || text.toLowerCase() === "null") return null;
  return text;
}

function parseLooseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  const text = normalizeNullableText(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseArrayLikeText(value: unknown): string[] {
  const normalized = normalizeNullableText(value);
  if (!normalized) return [];
  const jsonParsed = parseLooseJson(normalized);
  if (Array.isArray(jsonParsed)) {
    return jsonParsed.map((item) => normalizeNullableText(item)).filter(Boolean) as string[];
  }
  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return normalized
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"+|"+$/g, "").replace(/\\"/g, "\"").trim())
      .filter(Boolean);
  }
  return [];
}

function parseTagList(value: unknown): string[] {
  const normalized = normalizeNullableText(value);
  if (!normalized) return [];
  return normalized
    .split(/[,\n\r;，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanFlag(value: unknown): boolean | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (lowered === "1" || lowered === "true" || lowered === "yes") return true;
  if (lowered === "0" || lowered === "false" || lowered === "no") return false;
  return null;
}

function parseNumberOrNull(value: unknown): number | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function isEvidenceStatusAbnormal(value: unknown): boolean {
  const normalized = normalizeNullableText(value);
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  return !["1", "pass", "normal", "consistent", "ok", "true", "yes"].includes(lowered);
}

function isIssueRow(row: Record<string, unknown>): boolean {
  return (
    normalizeNullableText(row.verify_content_is_correct) === "0" ||
    normalizeNullableText(row.verify_action_is_correct) === "0" ||
    normalizeNullableText(row.qc_intercept_is_correct) === "0" ||
    isEvidenceStatusAbnormal(row.evidence_status) ||
    parseTagList(row.issue_observation_tags).length > 0 ||
    parseTagList(row.judgment_dimension_tags).length > 0
  );
}

function getIssueTypeLabel(issueType: string): string {
  const labels: Record<string, string> = {
    evidence_missing: "证据缺失",
    evidence_invalid: "证据无效",
    evidence_conflicting: "证据冲突",
    invalid_evidence_cited: "引用无效证据",
    name_judgment_problem: "名称判断问题",
    address_judgment_problem: "地址判断问题",
    type_judgment_problem: "类型判断问题",
    location_judgment_problem: "坐标判断问题",
    admin_judgment_problem: "行政区划判断问题",
    evidence_usage_problem: "证据使用问题",
    manual_escalation_strategy_problem: "转交策略问题",
    qc_intercept_rule_problem: "质检拦截规则问题",
  };
  return labels[issueType] ?? issueType;
}

function getSkillTypeLabel(skillType: string | null): string | null {
  if (!skillType) return null;
  const labels: Record<string, string> = {
    verification: "核实 Skill (verification)",
    verify: "核实 Skill (verify)",
    qc: "质检 Skill (qc)",
    "qc-stable": "质检 Skill (qc-stable)",
    "evidence-collection": "证据收集 Skill (evidence-collection)",
  };
  return labels[skillType] ?? skillType;
}

function basenameFromPath(pathText: string): string {
  const normalized = pathText.trim();
  if (!normalized) return "";
  const chunks = normalized.split(/[\\/]+/).filter(Boolean);
  return chunks[chunks.length - 1] ?? normalized;
}

function inferSkillKey(rawKey: string, promptPath: string | null): string {
  const key = rawKey.toLowerCase();
  const pathText = (promptPath ?? "").toLowerCase();
  const source = `${key} ${pathText}`;
  if (source.includes("evidence") || source.includes("collection")) return "evidence-collection";
  if (source.includes("verification") || source.includes("verify")) return "verification";
  if (source.includes("qc-stable") || source.includes("qc")) return "qc-stable";
  return rawKey;
}

function matchIssueType(issueType: string, issueObservationTags: string[], judgmentDimensionTags: string[]): boolean {
  const target = issueType.trim().toLowerCase();
  if (!target) return false;
  const allTags = [...issueObservationTags, ...judgmentDimensionTags];
  return allTags.some((tag) => tag.trim().toLowerCase() === target);
}

function getRegressionTypeLabel(regressionType: HitlRegressionType): string {
  return regressionType === "verify" ? "核实回归" : "质检回归";
}

function parseConsistencyFlag(value: unknown): boolean | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  if (["是", "true", "1", "yes", "y"].includes(normalized.toLowerCase()) || normalized === "是") return true;
  if (["否", "false", "0", "no", "n"].includes(normalized.toLowerCase()) || normalized === "否") return false;
  return null;
}

function valuesEqual(left: string | null, right: string | null): boolean {
  return (left ?? "") === (right ?? "");
}

function parseDiffField(rawValue: unknown, explicitNewValue?: unknown, label = ""): HitlRegressionFieldDiff {
  const rawText = normalizeNullableText(rawValue);
  const fallbackNew = normalizeNullableText(explicitNewValue);
  if (rawText && rawText.includes("->")) {
    const [oldText, ...rest] = rawText.split("->");
    const parsedNew = normalizeNullableText(rest.join("->"));
    return {
      label,
      oldValue: normalizeNullableText(oldText),
      newValue: fallbackNew ?? parsedNew,
      diffText: rawText,
    };
  }
  if (rawText && fallbackNew && !valuesEqual(rawText, fallbackNew)) {
    return {
      label,
      oldValue: rawText,
      newValue: fallbackNew,
      diffText: `${rawText} -> ${fallbackNew}`,
    };
  }
  if (rawText || fallbackNew) {
    return {
      label,
      oldValue: rawText,
      newValue: fallbackNew ?? rawText,
      diffText: rawText && fallbackNew && valuesEqual(rawText, fallbackNew) ? rawText : null,
    };
  }
  return { label, oldValue: null, newValue: null, diffText: null };
}

function getVerifyResultRank(value: string | null): number | null {
  if (!value) return null;
  if (value === "核实通过") return 2;
  if (value === "需人工核实") return 1;
  return 0;
}

function getQcStatusRank(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "qualified") return 3;
  if (normalized === "risky") return 2;
  if (normalized === "unqualified") return 1;
  return 0;
}

function inferRegressionDiffDirection(
  regressionType: HitlRegressionType,
  primaryDiff: HitlRegressionFieldDiff,
  isConsistent: boolean | null,
): HitlRegressionDiffDirection {
  const oldValue = primaryDiff.oldValue;
  const newValue = primaryDiff.newValue;
  if (!oldValue && !newValue) {
    return isConsistent === true ? "same" : "unknown";
  }
  if (valuesEqual(oldValue, newValue)) {
    return "same";
  }

  const oldRank = regressionType === "verify" ? getVerifyResultRank(oldValue) : getQcStatusRank(oldValue);
  const newRank = regressionType === "verify" ? getVerifyResultRank(newValue) : getQcStatusRank(newValue);
  if (oldRank != null && newRank != null) {
    if (newRank > oldRank) return "better";
    if (newRank < oldRank) return "worsen";
  }

  return isConsistent === true ? "same" : "unknown";
}

function pickDetailPreview(row: Record<string, unknown>): string | null {
  const parts = [
    parseDiffField(row.compare_name).diffText,
    parseDiffField(row.compare_address).diffText,
    parseDiffField(row.compare_poi_type).diffText,
    parseDiffField(row.compare_city).diffText,
    parseDiffField(row.compare_city_adcode).diffText,
    parseDiffField(row.compare_status).diffText,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.slice(0, 2).join(" | ") : null;
}

function matchesRunAt(candidate: string | null, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!candidate) return false;
  return candidate === expected;
}

function matchesRunId(candidate: string | null, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!candidate) return false;
  return candidate === expected;
}

function compareByRunTimeDesc(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftTime = normalizeNullableText(left.updatetime) ?? "";
  const rightTime = normalizeNullableText(right.updatetime) ?? "";
  if (leftTime !== rightTime) return rightTime.localeCompare(leftTime);
  const leftSuffix = normalizeNullableText(left.timestamp_suffix) ?? "";
  const rightSuffix = normalizeNullableText(right.timestamp_suffix) ?? "";
  return rightSuffix.localeCompare(leftSuffix);
}

function toRatio(value: unknown): number | null {
  const num = parseNumberOrNull(value);
  return num == null ? null : num;
}

function buildRegressionSummaryCard(
  batchId: string,
  regressionType: HitlRegressionType,
  row: RegressionRunSummaryRow,
): HitlRegressionSummaryCard {
  const datasetName = normalizeNullableText(row.dataset_name);
  const runAt = normalizeNullableText(row.updatetime);
  const runId = normalizeNullableText(row.timestamp_suffix);
  const betterRatio = regressionType === "verify" ? toRatio(row.verify_better_ratio) : toRatio(row.qc_better_ratio);
  const worsenRatio = regressionType === "verify" ? toRatio(row.verify_worsen_ratio) : toRatio(row.qc_worsen_ratio);
  const query = new URLSearchParams();
  if (runId) query.set("runId", runId);
  if (datasetName) query.set("datasetName", datasetName);
  if (runAt) query.set("runAt", runAt);
  return {
    regressionType,
    title: getRegressionTypeLabel(regressionType),
    batchId,
    datasetName,
    runAt,
    runId,
    totalCount: Number(row.total_count ?? 0),
    positiveCount: Number(row.positive_count ?? 0),
    negativeCount: Number(row.negative_count ?? 0),
    betterRatio,
    worsenRatio,
    detailUrl: `/hitl-iterations/${encodeURIComponent(batchId)}/regressions/${regressionType}${query.size > 0 ? `?${query.toString()}` : ""}`,
  };
}

function buildDecisionOverview(row: RegressionRunSummaryRow | null): HitlIterationDecisionOverview | null {
  if (!row) return null;

  const verifyBetter = toRatio(row.verify_better_ratio);
  const verifyWorsen = toRatio(row.verify_worsen_ratio);
  const qcBetter = toRatio(row.qc_better_ratio);
  const qcWorsen = toRatio(row.qc_worsen_ratio);
  const runAt = normalizeNullableText(row.updatetime);
  const datasetName = normalizeNullableText(row.dataset_name);
  const runId = normalizeNullableText(row.timestamp_suffix);
  const worsenThreshold = 0.001;
  const positiveThreshold = 0.001;
  const reasonItems: HitlDecisionReasonItem[] = [];

  if ((verifyWorsen ?? 0) > worsenThreshold) {
    reasonItems.push({
      type: "verify_worsen",
      title: "核实回归出现逆向",
      description: `核实逆向率为 ${(verifyWorsen ?? 0).toFixed(4)}，存在发布回退风险。`,
      severity: "high",
      metricValue: verifyWorsen,
    });
  }
  if ((qcWorsen ?? 0) > worsenThreshold) {
    reasonItems.push({
      type: "qc_worsen",
      title: "质检回归出现逆向",
      description: `质检逆向率为 ${(qcWorsen ?? 0).toFixed(4)}，说明上线后可能放大质检风险。`,
      severity: "high",
      metricValue: qcWorsen,
    });
  }

  let decision: HitlIterationDecisionOverview["decision"] = "review";
  let decisionLabel = "建议人工复核";
  let reasonSummary = "当前回归信号不够稳定，建议结合明细样本进一步复核。";

  if (reasonItems.some((item) => item.severity === "high")) {
    decision = "rollback";
    decisionLabel = "建议回滚";
    reasonSummary = "回归结果出现明确逆向信号，当前不建议直接上线。";
  } else if ((verifyBetter ?? 0) > positiveThreshold || (qcBetter ?? 0) > positiveThreshold) {
    decision = "launch";
    decisionLabel = "建议上线";
    reasonSummary = "核实与质检未见逆向，且出现正向收益，可进入上线决策。";
  }

  if ((verifyBetter ?? 0) > positiveThreshold) {
    reasonItems.push({
      type: "verify_better",
      title: "核实回归保持正向收益",
      description: `核实提升率为 ${(verifyBetter ?? 0).toFixed(4)}，说明改动对核实结果有正向作用。`,
      severity: decision === "launch" ? "medium" : "low",
      metricValue: verifyBetter,
    });
  }
  if ((qcBetter ?? 0) > positiveThreshold) {
    reasonItems.push({
      type: "qc_better",
      title: "质检回归保持正向收益",
      description: `质检提升率为 ${(qcBetter ?? 0).toFixed(4)}，说明改动对质检结果有正向作用。`,
      severity: decision === "launch" ? "medium" : "low",
      metricValue: qcBetter,
    });
  }
  if (reasonItems.length === 0) {
    reasonItems.push({
      type: "neutral",
      title: "当前没有显著正负向波动",
      description: "回归摘要未出现明显提升或逆向，需要结合差异明细做人工判断。",
      severity: "medium",
      metricValue: null,
    });
  }

  return {
    decision,
    decisionLabel,
    reasonSummary,
    runAt,
    datasetName,
    runId,
    verifyBetterRatio: verifyBetter,
    verifyWorsenRatio: verifyWorsen,
    qcBetterRatio: qcBetter,
    qcWorsenRatio: qcWorsen,
    reasonItems: reasonItems.slice(0, 4),
  };
}

function readSampleData(): SampleSeedRecord[] {
  const samplePath = path.resolve(process.cwd(), "example", "db_conf", "sample_data.json");
  const raw = fs.readFileSync(samplePath, "utf8");
  return JSON.parse(raw) as SampleSeedRecord[];
}

function normalizeHitlSeedSql(sqlText: string): string {
  return sqlText
    .replace(/INSERT INTO\s+public\./g, "INSERT INTO ")
    .replace(/'batch_0415'/g, "'batch-0415'");
}

function seedHitlRegressionTables(db: Database.Database): void {
  const regressionCount = Number(
    (db.prepare("SELECT COUNT(*) as count FROM poi_verified_regression_test").get() as { count: number }).count,
  );
  const compareCount = Number(
    (db.prepare("SELECT COUNT(*) as count FROM poi_verified_regression_test_compare").get() as { count: number }).count,
  );
  const resultCount = Number(
    (db.prepare("SELECT COUNT(*) as count FROM poi_verified_regression_test_result").get() as { count: number }).count,
  );
  if (regressionCount > 0 && compareCount > 0 && resultCount > 0) return;

  const exampleDir = path.resolve(process.cwd(), "example", "hitl", "example");
  const fileCandidates = [
    "public.poi_verified_regression.txt",
    "public.poi_verified_regression_test_compare.txt",
    "public.poi_verified_regression_compare.txt",
    "public.poi_verified_regression_test_result.txt",
  ];

  const sqlList = fileCandidates
    .map((fileName) => path.join(exampleDir, fileName))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => normalizeHitlSeedSql(fs.readFileSync(filePath, "utf8")))
    .filter((sqlText) => sqlText.trim().length > 0);

  if (sqlList.length === 0) return;

  const tx = db.transaction(() => {
    db.exec("DELETE FROM poi_verified_regression_test;");
    db.exec("DELETE FROM poi_verified_regression_test_compare;");
    db.exec("DELETE FROM poi_verified_regression_test_result;");
    for (const sqlText of sqlList) {
      db.exec(sqlText);
    }
  });

  tx();
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

    CREATE TABLE IF NOT EXISTS poi_task_analysis (
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

    CREATE INDEX IF NOT EXISTS idx_temp_task_task_phase ON poi_task_analysis(task_id, phase);
    CREATE INDEX IF NOT EXISTS idx_temp_task_batch ON poi_task_analysis(import_batch_id);

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

function ensureHitlSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS iteration_negative_samples (
      task_id TEXT,
      id TEXT,
      batch_id TEXT,
      name TEXT,
      poi_type TEXT,
      address TEXT,
      city TEXT,
      verify_result TEXT,
      quality_status TEXT,
      qc_status TEXT,
      qc_score TEXT,
      qc_result TEXT,
      is_qualified TEXT,
      has_risk TEXT,
      qc_time TEXT,
      updatetime TEXT,
      verify_info TEXT,
      evidence_record TEXT,
      verify_content_is_correct TEXT,
      verify_action_is_correct TEXT,
      qc_intercept_is_correct TEXT,
      evidence_status TEXT,
      issue_observation_tags TEXT,
      judgment_dimension_tags TEXT,
      manual_comment TEXT,
      conflicting_evidence TEXT,
      manual_added_evidence_url TEXT,
      manual_added_evidence_type TEXT,
      manual_added_evidence_abstract TEXT,
      verified_name TEXT,
      verified_addr TEXT,
      verified_poi_type TEXT,
      verified_city_adcode TEXT
    );

    CREATE TABLE IF NOT EXISTS iteration_overlay_drafts (
      batch_id TEXT PRIMARY KEY,
      overlay_draft TEXT,
      tag_distribution TEXT,
      prompt_paths TEXT,
      prompts TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS iteration_skill_modifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      target_skill TEXT NOT NULL,
      modified_file TEXT,
      backup_path TEXT,
      changes TEXT,
      status TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS poi_verified_regression_test (
      batch_id TEXT,
      dataset_id TEXT,
      dataset_name TEXT,
      id TEXT,
      name TEXT,
      x_coord REAL,
      y_coord REAL,
      poi_type TEXT,
      address TEXT,
      city TEXT,
      city_adcode TEXT,
      status TEXT,
      true_name TEXT,
      true_x_coord REAL,
      true_y_coord REAL,
      true_poi_type TEXT,
      true_address TEXT,
      true_city TEXT,
      true_city_adcode TEXT,
      true_status TEXT,
      updatetime TEXT,
      dataset_type TEXT,
      verify_info TEXT,
      evidence_record TEXT,
      verified_name TEXT,
      verified_x_coord REAL,
      verified_y_coord REAL,
      verified_poi_type TEXT,
      verified_address TEXT,
      verified_city TEXT,
      verified_city_adcode TEXT,
      verified_status TEXT,
      verified_verify_result TEXT,
      sample_type TEXT,
      cur_verify_result TEXT,
      cur_qc_status TEXT,
      task_id TEXT
    );

    CREATE TABLE IF NOT EXISTS poi_verified_regression_test_compare (
      batch_id TEXT,
      dataset_id TEXT,
      dataset_name TEXT,
      dataset_type TEXT,
      updatetime TEXT,
      task_id TEXT,
      id TEXT,
      compare_name TEXT,
      compare_x_coord TEXT,
      compare_y_coord TEXT,
      compare_poi_type TEXT,
      compare_address TEXT,
      compare_city TEXT,
      compare_city_adcode TEXT,
      compare_status TEXT,
      is_consistent TEXT,
      sample_type TEXT,
      compare_verify_result TEXT,
      compare_qc_status TEXT,
      new_verify_result TEXT,
      new_qc_status TEXT
    );

    CREATE TABLE IF NOT EXISTS poi_verified_regression_test_result (
      batch_id TEXT,
      dataset_id TEXT,
      dataset_name TEXT,
      dataset_type TEXT,
      updatetime TEXT,
      timestamp_suffix TEXT,
      total_count INTEGER,
      positive_count INTEGER,
      negative_count INTEGER,
      verify_worsen_ratio REAL,
      verify_better_ratio REAL,
      qc_worsen_ratio REAL,
      qc_better_ratio REAL,
      total_worsen_ratio REAL,
      total_better_ratio REAL
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
    clauses.push(`(COALESCE(verify_result, '') = '${VERIFY_MANUAL}' OR is_qualified = 0)`);
  }

  if (filters.anomalyOnly) {
    clauses.push("COALESCE(has_anomaly, 0) = 1");
  }

  for (const tag of filters.alertTags) {
    if (tag === "核实阻塞异常") alertClauses.push("COALESCE(verify_retry_count, 0) > 5");
    if (tag === "核实执行异常") alertClauses.push("(verify_task_id IS NOT NULL AND COALESCE(verify_status, '') <> 'success' AND COALESCE(verify_retry_count, 0) <= 5)");
    if (tag === "质检阻塞异常") alertClauses.push("COALESCE(qc_retry_count, 0) > 5");
    if (tag === "质检执行异常") alertClauses.push("(qc_task_id IS NOT NULL AND COALESCE(qc_status_run, '') <> 'success' AND COALESCE(qc_retry_count, 0) <= 5)");
    if (tag === "需人工介入") alertClauses.push(`(COALESCE(verify_result, '') = '${VERIFY_MANUAL}' OR is_qualified = 0)`);
    if (tag === "质检不通过") alertClauses.push("is_qualified = 0");
    if (tag === "高风险任务") alertClauses.push("(COALESCE(has_risk, 0) = 1 OR COALESCE(qc_status, '') = 'risky')");
    if (tag === "核实状态不一致") alertClauses.push("COALESCE(verify_mismatch_reason, '') != ''");
    if (tag === "质检状态不一致") alertClauses.push("COALESCE(qc_mismatch_reason, '') != ''");
  }

  if (alertClauses.length > 0) {
    clauses.push(`(${alertClauses.join(" OR ")})`);
  }

  if (filters.batches && filters.batches.length > 0) {
    const likeClauses = filters.batches.map((_, i) => `(task_id = @batch_exact_${i} OR task_id LIKE @batch_like_${i})`);
    clauses.push(`(${likeClauses.join(" OR ")})`);
    filters.batches.forEach((b, i) => {
      params[`batch_exact_${i}`] = b;
      params[`batch_like_${i}`] = `%_${b}`;
    });
  }

  if (filters.startTime) {
    clauses.push("julianday(replace(COALESCE(qc_time, verify_time, updatetime), ',', '.')) >= julianday(@startTime)");
    params.startTime = filters.startTime;
  }

  if (filters.endTime) {
    clauses.push("julianday(replace(COALESCE(qc_time, verify_time, updatetime), ',', '.')) <= julianday(@endTime)");
    params.endTime = filters.endTime;
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
    latestActionTime: (row.latest_action_time as string | null) ?? null,
    latestActionType: (row.latest_action_type as "qc" | "verify" | "init" | null) ?? null,
  };

  if (mismatchVerify) item.anomalies.push(mismatchVerify);
  if (mismatchQc) item.anomalies.push(mismatchQc);
  if (!verifyRun && item.verifiedStatus) item.anomalies.push("数据库有核实状态，但日志侧未找到核实执行记录");
  if (!qcRun && item.qcStatus) item.anomalies.push("数据库有质检状态，但日志侧未找到质检执行记录");

  return item;
}

export class DashboardRepository implements DashboardRepositoryPort {
  private readonly db: Database.Database;
  private hitlTableNames: {
    negative: string | null;
    overlay: string | null;
    modification: string | null;
    regression: string | null;
    regressionCompare: string | null;
    regressionResult: string | null;
  } | null = null;

  constructor() {
    this.db = createDb();
    ensureSchema(this.db);
    ensureHitlSchema(this.db);
    seedBusinessTables(this.db);
    seedHitlRegressionTables(this.db);
  }

  private resolveHitlTableName(candidates: string[]): string | null {
    for (const tableName of candidates) {
      const exists = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
        .get(tableName);
      if (exists) return tableName;
    }
    return null;
  }

  private getHitlTableNames(): {
    negative: string | null;
    overlay: string | null;
    modification: string | null;
    regression: string | null;
    regressionCompare: string | null;
    regressionResult: string | null;
  } {
    if (this.hitlTableNames) return this.hitlTableNames;
    this.hitlTableNames = {
      negative: this.resolveHitlTableName(["iteration_negative_samples", "iteration_negative_samples_0415_bak"]),
      overlay: this.resolveHitlTableName(["iteration_overlay_drafts", "iteration_overlay_drafts_0415_bak"]),
      modification: this.resolveHitlTableName(["iteration_skill_modifications", "iteration_skill_modifications_0415_bak"]),
      regression: this.resolveHitlTableName(["poi_verified_regression_test"]),
      regressionCompare: this.resolveHitlTableName(["poi_verified_regression_test_compare"]),
      regressionResult: this.resolveHitlTableName(["poi_verified_regression_test_result"]),
    };
    return this.hitlTableNames;
  }

  private getOverlayByBatch(batchId: string): Record<string, unknown> | null {
    const { overlay } = this.getHitlTableNames();
    if (!overlay) return null;
    const row = this.db
      .prepare(`SELECT batch_id, overlay_draft, prompt_paths, prompts FROM ${overlay} WHERE batch_id = ? LIMIT 1`)
      .get(batchId) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  private getFlowSteps(
    sampleCount: number,
    hasOverlay: boolean,
    hasModification: boolean,
    regressionOverview: HitlIterationRegressionOverview | null,
    decisionOverview: HitlIterationDecisionOverview | null,
  ): HitlFlowStep[] {
    const hasFeedback = sampleCount > 0;
    const hasAnalysis = hasOverlay;
    const hasIteration = hasModification;
    const hasCandidate = hasModification;
    const hasRegression = Boolean(regressionOverview);
    const hasDecision = Boolean(decisionOverview);
    return [
      {
        id: "feedback",
        label: "反馈池",
        status: hasFeedback ? "completed" : "pending",
        summary: hasFeedback ? `已收集 ${sampleCount} 条人工作业反馈样本。` : "暂无人工作业样本。",
      },
      {
        id: "analysis",
        label: "问题分析",
        status: hasAnalysis ? "completed" : hasFeedback ? "active" : "pending",
        summary: hasAnalysis ? "已生成模型问题分析结论。" : "待生成问题分析结论。",
      },
      {
        id: "iteration",
        label: "迭代处理",
        status: hasIteration ? "completed" : hasAnalysis ? "active" : "pending",
        summary: hasIteration ? "已产出 Skill 迭代修改结果。" : "待执行 Skill 迭代修改。",
      },
      {
        id: "candidate",
        label: "候选版本",
        status: hasCandidate ? "completed" : hasIteration ? "active" : "pending",
        summary: hasCandidate ? "已形成候选版本产物。" : "待形成候选版本。",
      },
      {
        id: "regression",
        label: "回归验证",
        status: hasRegression ? "completed" : hasCandidate ? "active" : "pending",
        summary: hasRegression
          ? `已完成 ${regressionOverview?.datasetName ?? "当前数据集"} 的回归摘要聚合。`
          : "回归结果生成中。",
      },
      {
        id: "decision",
        label: "最终结论",
        status: hasDecision ? "completed" : hasRegression ? "active" : "pending",
        summary: hasDecision
          ? `${decisionOverview?.decisionLabel ?? "已生成发布结论"}。`
          : "待根据回归指标生成最终结论。",
      },
    ];
  }

  private buildPromptItems(promptValue: unknown, promptPathsValue: unknown): HitlPromptItem[] {
    const promptPaths = parseArrayLikeText(promptPathsValue);
    const prompts = parseLooseJson(promptValue);
    const list: HitlPromptItem[] = [];
    if (prompts && typeof prompts === "object" && !Array.isArray(prompts)) {
      for (const [key, value] of Object.entries(prompts as Record<string, unknown>)) {
        const content = normalizeNullableText(value);
        if (!content) continue;
        const matchedPath = promptPaths.find((pathText) => pathText.includes(key)) ?? null;
        const inferredSkillKey = inferSkillKey(key, matchedPath);
        const promptFileName = matchedPath ? basenameFromPath(matchedPath) : basenameFromPath(key) || "prompt.txt";
        list.push({
          skillKey: inferredSkillKey,
          skillLabel: getSkillTypeLabel(inferredSkillKey) ?? inferredSkillKey,
          promptFileName,
          promptPath: matchedPath,
          content,
        });
      }
    }
    return list;
  }

  private getRegressionRunSummaries(batchId: string): RegressionRunSummaryRow[] {
    const { regressionResult } = this.getHitlTableNames();
    if (!regressionResult) return [];
    return this.db
      .prepare(`
        SELECT
          batch_id, dataset_name, updatetime, timestamp_suffix,
          total_count, positive_count, negative_count,
          verify_better_ratio, verify_worsen_ratio,
          qc_better_ratio, qc_worsen_ratio
        FROM ${regressionResult}
        WHERE batch_id = ?
      `)
      .all(batchId) as RegressionRunSummaryRow[];
  }

  private selectRegressionRun(
    batchId: string,
    runId?: string,
    datasetName?: string,
    runAt?: string,
  ): RegressionRunSummaryRow | null {
    const rows = this.getRegressionRunSummaries(batchId).sort(compareByRunTimeDesc);
    if (runId) {
      const matchedByRunId = rows.filter((row) => matchesRunId(normalizeNullableText(row.timestamp_suffix), runId));
      if (matchedByRunId.length > 0) {
        const narrowedByCompatFields = matchedByRunId.filter((row) => {
          const rowDatasetName = normalizeNullableText(row.dataset_name);
          if (datasetName && rowDatasetName !== datasetName) return false;
          return matchesRunAt(normalizeNullableText(row.updatetime), runAt);
        });
        return narrowedByCompatFields[0] ?? matchedByRunId[0];
      }
    }
    const filtered = rows.filter((row) => {
      const rowDatasetName = normalizeNullableText(row.dataset_name);
      if (datasetName && rowDatasetName !== datasetName) return false;
      return matchesRunAt(normalizeNullableText(row.updatetime), runAt);
    });
    return filtered[0] ?? rows[0] ?? null;
  }

  private buildRegressionOverview(batchId: string): HitlIterationRegressionOverview | null {
    const selected = this.selectRegressionRun(batchId);
    if (!selected) return null;
    return {
      batchId,
      latestRunAt: normalizeNullableText(selected.updatetime),
      datasetName: normalizeNullableText(selected.dataset_name),
      runId: normalizeNullableText(selected.timestamp_suffix),
      verify: buildRegressionSummaryCard(batchId, "verify", selected),
      qc: buildRegressionSummaryCard(batchId, "qc", selected),
    };
  }

  private getRegressionCompareRows(
    batchId: string,
    selectedRun: RegressionRunSummaryRow,
  ): Array<Record<string, unknown>> {
    const { regressionCompare } = this.getHitlTableNames();
    if (!regressionCompare) return [];
    const datasetName = normalizeNullableText(selectedRun.dataset_name);
    const runId = normalizeNullableText(selectedRun.timestamp_suffix);
    const rows = datasetName
      ? (this.db
          .prepare(`SELECT * FROM ${regressionCompare} WHERE batch_id = ? AND dataset_name = ?`)
          .all(batchId, datasetName) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM ${regressionCompare} WHERE batch_id = ?`)
          .all(batchId) as Array<Record<string, unknown>>);
    return rows
      .filter((row) => {
        if (!runId) return true;
        return (normalizeNullableText(row.task_id) ?? "").includes(runId);
      })
      .sort(compareByRunTimeDesc);
  }

  private getRegressionSampleRows(
    batchId: string,
    selectedRun: RegressionRunSummaryRow,
  ): Array<Record<string, unknown>> {
    const { regression } = this.getHitlTableNames();
    if (!regression) return [];
    const datasetName = normalizeNullableText(selectedRun.dataset_name);
    const runId = normalizeNullableText(selectedRun.timestamp_suffix);
    const rows = datasetName
      ? (this.db
          .prepare(`SELECT * FROM ${regression} WHERE batch_id = ? AND dataset_name = ?`)
          .all(batchId, datasetName) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM ${regression} WHERE batch_id = ?`)
          .all(batchId) as Array<Record<string, unknown>>);
    return rows
      .filter((row) => {
        if (!runId) return true;
        return (normalizeNullableText(row.task_id) ?? "").includes(runId);
      })
      .sort(compareByRunTimeDesc);
  }

  private normalizeRegressionDiffRow(
    batchId: string,
    regressionType: HitlRegressionType,
    selectedRun: RegressionRunSummaryRow,
    row: Record<string, unknown>,
  ): HitlRegressionDiffRow {
    const primaryDiff = regressionType === "verify"
      ? parseDiffField(row.compare_verify_result, row.new_verify_result, "核实结果")
      : parseDiffField(row.compare_qc_status, row.new_qc_status, "质检结果");
    const secondaryDiff = regressionType === "verify"
      ? parseDiffField(row.compare_qc_status, row.new_qc_status, "质检结果")
      : parseDiffField(row.compare_verify_result, row.new_verify_result, "核实结果");
    const sampleId = normalizeNullableText(row.id) ?? "";
    const taskId = normalizeNullableText(row.task_id);
    const datasetName = normalizeNullableText(selectedRun.dataset_name);
    const runAt = normalizeNullableText(selectedRun.updatetime);
    const runId = normalizeNullableText(selectedRun.timestamp_suffix);
    const query = new URLSearchParams();
    if (runId) query.set("runId", runId);
    if (datasetName) query.set("datasetName", datasetName);
    if (runAt) query.set("runAt", runAt);
    if (taskId) query.set("taskId", taskId);
    const isConsistent = parseConsistencyFlag(row.is_consistent);
    return {
      sampleId,
      taskId,
      poiName: normalizeNullableText(row.compare_name),
      sampleType: normalizeNullableText(row.sample_type),
      isConsistent,
      diffDirection: inferRegressionDiffDirection(regressionType, primaryDiff, isConsistent),
      primaryOldValue: primaryDiff.oldValue,
      primaryNewValue: primaryDiff.newValue,
      primaryDiffText: primaryDiff.diffText,
      secondaryOldValue: secondaryDiff.oldValue,
      secondaryNewValue: secondaryDiff.newValue,
      secondaryDiffText: secondaryDiff.diffText,
      detailPreview: pickDetailPreview(row),
      sampleDetailUrl: `/hitl-iterations/${encodeURIComponent(batchId)}/regressions/${regressionType}/samples/${encodeURIComponent(sampleId)}${query.size > 0 ? `?${query.toString()}` : ""}`,
    };
  }

  private buildRegressionSummary(
    regressionType: HitlRegressionType,
    selectedRun: RegressionRunSummaryRow,
    rows: HitlRegressionDiffRow[],
  ): HitlRegressionSummary {
    const betterCount = rows.filter((row) => row.diffDirection === "better").length;
    const worsenCount = rows.filter((row) => row.diffDirection === "worsen").length;
    const sameCount = rows.filter((row) => row.diffDirection === "same").length;
    const unknownCount = rows.filter((row) => row.diffDirection === "unknown").length;
    return {
      totalCount: Number(selectedRun.total_count ?? rows.length),
      positiveCount: Number(selectedRun.positive_count ?? 0),
      negativeCount: Number(selectedRun.negative_count ?? 0),
      betterRatio: regressionType === "verify" ? toRatio(selectedRun.verify_better_ratio) : toRatio(selectedRun.qc_better_ratio),
      worsenRatio: regressionType === "verify" ? toRatio(selectedRun.verify_worsen_ratio) : toRatio(selectedRun.qc_worsen_ratio),
      changedCount: betterCount + worsenCount,
      betterCount,
      worsenCount,
      sameCount,
      unknownCount,
    };
  }

  async getHitlIterations(): Promise<{ items: HitlIterationListItem[] }> {
    const { negative, overlay, modification } = this.getHitlTableNames();
    if (!negative) return { items: [] };

    const rows = this.db
      .prepare(`
        SELECT
          n.batch_id AS batch_id,
          MIN(NULLIF(TRIM(COALESCE(n.updatetime, '')), '')) AS started_at,
          COUNT(*) AS sample_count,
          SUM(
            CASE WHEN (
              TRIM(COALESCE(n.verify_content_is_correct, '')) = '0'
              OR TRIM(COALESCE(n.verify_action_is_correct, '')) = '0'
              OR TRIM(COALESCE(n.qc_intercept_is_correct, '')) = '0'
              OR (
                LOWER(TRIM(COALESCE(n.evidence_status, ''))) NOT IN ('', 'nan', '1', 'pass', 'normal', 'consistent', 'ok', 'true', 'yes')
              )
              OR (
                TRIM(COALESCE(n.issue_observation_tags, '')) != '' AND LOWER(TRIM(COALESCE(n.issue_observation_tags, ''))) != 'nan'
              )
              OR (
                TRIM(COALESCE(n.judgment_dimension_tags, '')) != '' AND LOWER(TRIM(COALESCE(n.judgment_dimension_tags, ''))) != 'nan'
              )
            ) THEN 1 ELSE 0 END
          ) AS issue_count
        FROM ${negative} n
        WHERE TRIM(COALESCE(n.batch_id, '')) != ''
        GROUP BY n.batch_id
        ORDER BY started_at DESC, n.batch_id DESC
      `)
      .all() as Array<Record<string, unknown>>;

    const summaryMap = new Map<string, string | null>();
    if (overlay) {
      const summaryRows = this.db
        .prepare(`SELECT batch_id, overlay_draft FROM ${overlay}`)
        .all() as Array<Record<string, unknown>>;
      for (const row of summaryRows) {
        const batchId = normalizeNullableText(row.batch_id);
        if (!batchId) continue;
        const draft = parseLooseJson(row.overlay_draft) as Record<string, unknown> | null;
        summaryMap.set(batchId, normalizeNullableText(draft?.summary) ?? null);
      }
    }

    const modBatchSet = new Set<string>();
    if (modification) {
      const modRows = this.db
        .prepare(`SELECT DISTINCT batch_id FROM ${modification} WHERE TRIM(COALESCE(batch_id, '')) != ''`)
        .all() as Array<Record<string, unknown>>;
      for (const row of modRows) {
        const batchId = normalizeNullableText(row.batch_id);
        if (batchId) modBatchSet.add(batchId);
      }
    }

    const items = rows.map((row) => {
      const batchId = String(row.batch_id);
      const hasOverlay = summaryMap.has(batchId);
      const hasModification = modBatchSet.has(batchId);
      const status: HitlIterationListItem["status"] = hasModification ? "regression" : hasOverlay ? "iteration" : "analysis";
      return {
        batchId,
        startedAt: normalizeNullableText(row.started_at),
        sampleCount: Number(row.sample_count ?? 0),
        issueCount: Number(row.issue_count ?? 0),
        summary: summaryMap.get(batchId) ?? null,
        status,
      };
    });

    return { items };
  }

  async getHitlIterationDetail(batchId: string): Promise<HitlIterationDetail | null> {
    const { negative, modification } = this.getHitlTableNames();
    if (!negative) return null;

    const sampleRows = this.db
      .prepare(`SELECT * FROM ${negative} WHERE batch_id = ?`)
      .all(batchId) as Array<Record<string, unknown>>;
    if (sampleRows.length === 0) return null;

    const sampleCount = sampleRows.length;
    const issueCount = sampleRows.filter((row) => isIssueRow(row)).length;
    const startedAt = sampleRows
      .map((row) => normalizeNullableText(row.updatetime))
      .filter(Boolean)
      .sort()[0] ?? null;

    const overlayRow = this.getOverlayByBatch(batchId);
    const overlayDraft = parseLooseJson(overlayRow?.overlay_draft) as Record<string, unknown> | null;
    const prompts = this.buildPromptItems(overlayRow?.prompts, overlayRow?.prompt_paths);

    const rootCauses: HitlRootCauseItem[] = [];
    const issueDistribution = Array.isArray(overlayDraft?.issue_distribution)
      ? overlayDraft.issue_distribution as Array<Record<string, unknown>>
      : [];
    for (const item of issueDistribution) {
      const issueType = normalizeNullableText(item.issue_type) ?? "unknown";
      const skillType = normalizeNullableText(item.step) ?? "unknown";
      rootCauses.push({
        issueType,
        issueTypeLabel: getIssueTypeLabel(issueType),
        count: Number(item.count ?? 0),
        skillType,
        skillTypeLabel: getSkillTypeLabel(skillType) ?? skillType,
        summary: normalizeNullableText(overlayDraft?.root_cause_analysis) ?? normalizeNullableText(overlayDraft?.learnable_patterns),
        detailUrl: `/hitl-iterations/${encodeURIComponent(batchId)}/issues/${encodeURIComponent(issueType)}/tasks`,
      });
    }

    const learnablePatterns = Array.isArray(overlayDraft?.learnable_patterns)
      ? overlayDraft.learnable_patterns as Array<Record<string, unknown>>
      : [];
    const skillImpactDraft = overlayDraft?.skill_impact && typeof overlayDraft.skill_impact === "object"
      ? overlayDraft.skill_impact as Record<string, unknown>
      : {};
    const overlayInsight = {
      rootCauseAnalysis: normalizeNullableText(overlayDraft?.root_cause_analysis),
      learnablePatterns: learnablePatterns
        .map((item) => {
          const issueType = normalizeNullableText(item.issue_type) ?? "unknown";
          return {
            issueType,
            issueTypeLabel: getIssueTypeLabel(issueType),
            pattern: normalizeNullableText(item.pattern) ?? "",
            count: Number(item.count ?? 0),
          };
        })
        .filter((item) => item.pattern),
      skillImpact: Object.entries(skillImpactDraft)
        .map(([skillType, summary]) => ({
          skillType,
          skillTypeLabel: getSkillTypeLabel(skillType) ?? skillType,
          impactSummary: normalizeNullableText(summary) ?? "",
        }))
        .filter((item) => item.impactSummary),
    };

    const modificationRows = modification
      ? (this.db
          .prepare(`SELECT target_skill, modified_file, changes, status, created_at FROM ${modification} WHERE batch_id = ? ORDER BY created_at DESC`)
          .all(batchId) as Array<Record<string, unknown>>)
      : [];

    const modifications: HitlModificationItem[] = modificationRows.map((row) => {
      const changesObj = parseLooseJson(row.changes) as Record<string, unknown> | null;
      const modifiedFilesRaw = Array.isArray(changesObj?.modified_files) ? changesObj?.modified_files : [];
      const modifiedFiles = (modifiedFilesRaw as unknown[])
        .map((item) => normalizeNullableText(item))
        .filter(Boolean) as string[];
      const fallbackFile = normalizeNullableText(row.modified_file);
      if (modifiedFiles.length === 0 && fallbackFile) modifiedFiles.push(fallbackFile);
      const targetSkill = normalizeNullableText(row.target_skill) ?? "unknown";
      return {
        targetSkill,
        targetSkillLabel: getSkillTypeLabel(targetSkill) ?? targetSkill,
        changeSummary: normalizeNullableText(changesObj?.summary),
        modifiedFiles,
        status: normalizeNullableText(row.status),
        createdAt: normalizeNullableText(row.created_at),
      };
    });

    const hasOverlay = Boolean(overlayRow);
    const hasModification = modifications.length > 0;
    const regressionOverview = this.buildRegressionOverview(batchId);
    const decisionOverview = buildDecisionOverview(this.selectRegressionRun(batchId));
    return {
      overview: {
        batchId,
        startedAt,
        sampleCount,
        issueCount,
        summary: normalizeNullableText(overlayDraft?.summary),
        status: hasModification ? "regression" : hasOverlay ? "iteration" : "analysis",
      },
      flow: this.getFlowSteps(sampleCount, hasOverlay, hasModification, regressionOverview, decisionOverview),
      rootCauses,
      prompts,
      modifications,
      overlayInsight,
      regressionOverview,
      decisionOverview,
    };
  }

  async getHitlRegressionRuns(batchId: string): Promise<{ items: HitlRegressionRunItem[] }> {
    const items = this.getRegressionRunSummaries(batchId)
      .sort(compareByRunTimeDesc)
      .map((row) => ({
        batchId,
        datasetName: normalizeNullableText(row.dataset_name),
        runAt: normalizeNullableText(row.updatetime),
        runId: normalizeNullableText(row.timestamp_suffix),
        totalCount: Number(row.total_count ?? 0),
        positiveCount: Number(row.positive_count ?? 0),
        negativeCount: Number(row.negative_count ?? 0),
        verifyBetterRatio: toRatio(row.verify_better_ratio),
        verifyWorsenRatio: toRatio(row.verify_worsen_ratio),
        qcBetterRatio: toRatio(row.qc_better_ratio),
        qcWorsenRatio: toRatio(row.qc_worsen_ratio),
      }));
    return { items };
  }

  async getHitlRegressionDetail(
    batchId: string,
    regressionType: HitlRegressionType,
    runId?: string,
    datasetName?: string,
    runAt?: string,
  ): Promise<HitlRegressionDetailResponse | null> {
    const selectedRun = this.selectRegressionRun(batchId, runId, datasetName, runAt);
    if (!selectedRun) return null;

    const rows = this.getRegressionCompareRows(batchId, selectedRun).map((row) =>
      this.normalizeRegressionDiffRow(batchId, regressionType, selectedRun, row),
    );
    const sortedRows = [...rows].sort((left, right) => {
      const weight = (direction: HitlRegressionDiffDirection): number => {
        if (direction === "worsen") return 0;
        if (direction === "better") return 1;
        if (direction === "unknown") return 2;
        return 3;
      };
      return weight(left.diffDirection) - weight(right.diffDirection);
    });

    return {
      header: {
        batchId,
        regressionType,
        regressionTypeLabel: getRegressionTypeLabel(regressionType),
        datasetName: normalizeNullableText(selectedRun.dataset_name),
        runAt: normalizeNullableText(selectedRun.updatetime),
        runId: normalizeNullableText(selectedRun.timestamp_suffix),
        totalCount: Number(selectedRun.total_count ?? sortedRows.length),
      },
      summary: this.buildRegressionSummary(regressionType, selectedRun, sortedRows),
      rows: sortedRows,
    };
  }

  async getHitlRegressionSampleDetail(
    batchId: string,
    regressionType: HitlRegressionType,
    sampleId: string,
    runId?: string,
    datasetName?: string,
    runAt?: string,
    taskId?: string,
  ): Promise<HitlRegressionSampleDetail | null> {
    const selectedRun = this.selectRegressionRun(batchId, runId, datasetName, runAt);
    if (!selectedRun) return null;

    const compareRows = this.getRegressionCompareRows(batchId, selectedRun);
    const compareRow = compareRows.find((row) => {
      const rowSampleId = normalizeNullableText(row.id);
      const rowTaskId = normalizeNullableText(row.task_id);
      if (rowSampleId !== sampleId) return false;
      if (taskId && rowTaskId !== taskId) return false;
      return true;
    });
    if (!compareRow) return null;

    const sampleRows = this.getRegressionSampleRows(batchId, selectedRun);
    const sampleRow = sampleRows.find((row) => {
      const rowSampleId = normalizeNullableText(row.id);
      const rowTaskId = normalizeNullableText(row.task_id);
      if (rowSampleId !== sampleId) return false;
      if (taskId && rowTaskId !== taskId) return false;
      if (rowTaskId && normalizeNullableText(compareRow.task_id) && rowTaskId !== normalizeNullableText(compareRow.task_id)) {
        return false;
      }
      return true;
    }) ?? null;

    const primary = regressionType === "verify"
      ? parseDiffField(compareRow.compare_verify_result, compareRow.new_verify_result, "核实结果")
      : parseDiffField(compareRow.compare_qc_status, compareRow.new_qc_status, "质检结果");
    const secondary = regressionType === "verify"
      ? parseDiffField(compareRow.compare_qc_status, compareRow.new_qc_status, "质检结果")
      : parseDiffField(compareRow.compare_verify_result, compareRow.new_verify_result, "核实结果");
    const fieldDiffs: HitlRegressionFieldDiff[] = [
      parseDiffField(compareRow.compare_name, sampleRow?.verified_name, "名称"),
      parseDiffField(compareRow.compare_address, sampleRow?.verified_address, "地址"),
      parseDiffField(compareRow.compare_poi_type, sampleRow?.verified_poi_type, "POI 类型"),
      parseDiffField(compareRow.compare_city, sampleRow?.verified_city, "城市"),
      parseDiffField(compareRow.compare_city_adcode, sampleRow?.verified_city_adcode, "城市编码"),
      parseDiffField(compareRow.compare_status, sampleRow?.verified_status, "状态"),
    ].filter((item) => item.oldValue || item.newValue || item.diffText);

    return {
      header: {
        batchId,
        regressionType,
        regressionTypeLabel: getRegressionTypeLabel(regressionType),
        datasetName: normalizeNullableText(selectedRun.dataset_name),
        runAt: normalizeNullableText(selectedRun.updatetime),
        runId: normalizeNullableText(selectedRun.timestamp_suffix),
        sampleId,
        taskId: normalizeNullableText(compareRow.task_id),
        sampleType: normalizeNullableText(compareRow.sample_type) ?? normalizeNullableText(sampleRow?.sample_type),
        isConsistent: parseConsistencyFlag(compareRow.is_consistent),
      },
      baseInfo: {
        poiName: normalizeNullableText(compareRow.compare_name) ?? normalizeNullableText(sampleRow?.name),
        address: normalizeNullableText(compareRow.compare_address) ?? normalizeNullableText(sampleRow?.address),
        city: normalizeNullableText(compareRow.compare_city) ?? normalizeNullableText(sampleRow?.city),
        poiType: normalizeNullableText(compareRow.compare_poi_type) ?? normalizeNullableText(sampleRow?.poi_type),
        status: normalizeNullableText(compareRow.compare_status) ?? normalizeNullableText(sampleRow?.status),
      },
      resultDiffs: {
        primary,
        secondary,
      },
      fieldDiffs,
      truthInfo: {
        name: normalizeNullableText(sampleRow?.true_name),
        address: normalizeNullableText(sampleRow?.true_address),
        city: normalizeNullableText(sampleRow?.true_city),
        poiType: normalizeNullableText(sampleRow?.true_poi_type),
        cityAdcode: normalizeNullableText(sampleRow?.true_city_adcode),
        status: normalizeNullableText(sampleRow?.true_status),
      },
      currentInfo: {
        verifyResult: normalizeNullableText(sampleRow?.cur_verify_result),
        qcStatus: normalizeNullableText(sampleRow?.cur_qc_status),
      },
      verifiedInfo: {
        name: normalizeNullableText(sampleRow?.verified_name),
        address: normalizeNullableText(sampleRow?.verified_address),
        city: normalizeNullableText(sampleRow?.verified_city),
        poiType: normalizeNullableText(sampleRow?.verified_poi_type),
        cityAdcode: normalizeNullableText(sampleRow?.verified_city_adcode),
        status: normalizeNullableText(sampleRow?.verified_status),
        verifyResult: normalizeNullableText(sampleRow?.verified_verify_result),
      },
      verifyInfo: (parseLooseJson(sampleRow?.verify_info) as Record<string, unknown> | null) ?? null,
      evidenceRecord: parseLooseJson(sampleRow?.evidence_record),
    };
  }

  async getHitlIssueTasks(batchId: string, issueType: string): Promise<{ items: HitlIssueTaskListItem[] }> {
    const { negative } = this.getHitlTableNames();
    if (!negative) return { items: [] };

    const rows = this.db
      .prepare(`
        SELECT
          task_id, name, address, city, poi_type,
          verify_result, quality_status, issue_observation_tags,
          judgment_dimension_tags, manual_comment, updatetime
        FROM ${negative}
        WHERE batch_id = ?
      `)
      .all(batchId) as Array<Record<string, unknown>>;

    const items: HitlIssueTaskListItem[] = rows
      .map((row) => ({
        taskId: String(row.task_id ?? ""),
        name: normalizeNullableText(row.name),
        address: normalizeNullableText(row.address),
        city: normalizeNullableText(row.city),
        poiType: normalizeNullableText(row.poi_type),
        verifyResult: normalizeNullableText(row.verify_result),
        qualityStatus: normalizeNullableText(row.quality_status),
        issueObservationTags: parseTagList(row.issue_observation_tags),
        judgmentDimensionTags: parseTagList(row.judgment_dimension_tags),
        manualComment: normalizeNullableText(row.manual_comment),
        updatetime: normalizeNullableText(row.updatetime),
      }))
      .filter((item) => matchIssueType(issueType, item.issueObservationTags, item.judgmentDimensionTags))
      .sort((a, b) => (b.updatetime ?? "").localeCompare(a.updatetime ?? ""));

    return { items };
  }

  async getHitlIssueTaskDetail(batchId: string, issueType: string, taskId: string): Promise<HitlIssueTaskDetail | null> {
    const { negative } = this.getHitlTableNames();
    if (!negative) return null;

    const row = this.db
      .prepare(`SELECT * FROM ${negative} WHERE batch_id = ? AND task_id = ? LIMIT 1`)
      .get(batchId, taskId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const issueObservationTags = parseTagList(row.issue_observation_tags);
    const judgmentDimensionTags = parseTagList(row.judgment_dimension_tags);
    if (!matchIssueType(issueType, issueObservationTags, judgmentDimensionTags)) {
      return null;
    }

    const overlayRow = this.getOverlayByBatch(batchId);
    const overlayDraft = parseLooseJson(overlayRow?.overlay_draft) as Record<string, unknown> | null;
    const promptItems = this.buildPromptItems(overlayRow?.prompts, overlayRow?.prompt_paths);
    const issueDistribution = Array.isArray(overlayDraft?.issue_distribution)
      ? overlayDraft.issue_distribution as Array<Record<string, unknown>>
      : [];
    const issueDistributionItem = issueDistribution.find(
      (item) => normalizeNullableText(item.issue_type)?.toLowerCase() === issueType.toLowerCase(),
    ) ?? null;
    const skillType = normalizeNullableText(issueDistributionItem?.step);

    const filteredPrompts = promptItems.filter((item) => {
      const normalizedSkill = skillType?.toLowerCase();
      if (normalizedSkill && item.skillKey.toLowerCase().includes(normalizedSkill)) return true;
      return item.content.toLowerCase().includes(issueType.toLowerCase());
    });

    return {
      task: {
        taskId,
        batchId,
        id: normalizeNullableText(row.id),
        name: normalizeNullableText(row.name),
        address: normalizeNullableText(row.address),
        city: normalizeNullableText(row.city),
        poiType: normalizeNullableText(row.poi_type),
        updatetime: normalizeNullableText(row.updatetime),
        qcTime: normalizeNullableText(row.qc_time),
      },
      verifyResult: {
        verifyResult: normalizeNullableText(row.verify_result),
        verifyInfo: parseLooseJson(row.verify_info) as Record<string, unknown> | null,
        evidenceRecord: parseLooseJson(row.evidence_record),
      },
      qcResult: {
        qualityStatus: normalizeNullableText(row.quality_status),
        qcStatus: normalizeNullableText(row.qc_status),
        qcScore: parseNumberOrNull(row.qc_score),
        qcResult: parseLooseJson(row.qc_result) as Record<string, unknown> | null,
        isQualified: parseBooleanFlag(row.is_qualified),
        hasRisk: parseBooleanFlag(row.has_risk),
      },
      manualResult: {
        verifyContentIsCorrect: parseBooleanFlag(row.verify_content_is_correct),
        verifyActionIsCorrect: parseBooleanFlag(row.verify_action_is_correct),
        qcInterceptIsCorrect: parseBooleanFlag(row.qc_intercept_is_correct),
        evidenceStatus: normalizeNullableText(row.evidence_status),
        issueObservationTags,
        judgmentDimensionTags,
        manualComment: normalizeNullableText(row.manual_comment),
        conflictingEvidence: normalizeNullableText(row.conflicting_evidence),
        manualAddedEvidenceUrl: normalizeNullableText(row.manual_added_evidence_url),
        manualAddedEvidenceType: normalizeNullableText(row.manual_added_evidence_type),
        manualAddedEvidenceAbstract: normalizeNullableText(row.manual_added_evidence_abstract),
        verifiedName: normalizeNullableText(row.verified_name),
        verifiedAddr: normalizeNullableText(row.verified_addr),
        verifiedPoiType: normalizeNullableText(row.verified_poi_type),
        verifiedCityAdcode: normalizeNullableText(row.verified_city_adcode),
      },
      modelAnalysis: {
        issueType,
        issueTypeLabel: getIssueTypeLabel(issueType),
        skillType,
        skillTypeLabel: getSkillTypeLabel(skillType),
        summary: normalizeNullableText(overlayDraft?.root_cause_analysis) ?? normalizeNullableText(overlayDraft?.summary),
        rootCause: issueDistributionItem,
        prompts: filteredPrompts.length > 0 ? filteredPrompts : promptItems,
      },
    };
  }

  async clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }> {
    const deleteRuns = this.db.prepare("DELETE FROM poi_task_analysis").run();
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
      INSERT INTO poi_task_analysis (
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

  async getOverview(
    batches?: string[],
    startTime?: string,
    endTime?: string,
    granularity: DashboardTimeGranularity = "hour",
  ): Promise<DashboardOverview> {
    const buildClauses = (
      prefix = "",
      opts?: { timePrefix?: string; timeField?: string; timeExpr?: string },
    ): { clauses: string[]; params: Record<string, unknown> } => {
      const clauses: string[] = [];
      const params: Record<string, unknown> = {};

      if (batches && batches.length > 0) {
        const batchClauses = batches.map((_, i) => `(${prefix}task_id = @b_exact_${i} OR ${prefix}task_id LIKE @b_like_${i})`);
        clauses.push(`(${batchClauses.join(" OR ")})`);
        batches.forEach((batch, i) => {
          params[`b_exact_${i}`] = batch;
          params[`b_like_${i}`] = `%_${batch}`;
        });
      }

      if (startTime || endTime) {
        const timeExpr =
          opts?.timeExpr ??
          `julianday(replace(${opts?.timePrefix ?? ""}${opts?.timeField ?? "started_at"}, ',', '.'))`;
        if (startTime) {
          clauses.push(`${timeExpr} >= julianday(@startTime)`);
          params.startTime = startTime;
        }
        if (endTime) {
          clauses.push(`${timeExpr} <= julianday(@endTime)`);
          params.endTime = endTime;
        }
      }

      return { clauses, params };
    };

    const buildWhere = (
      prefix = "",
      opts?: { timePrefix?: string; timeField?: string; timeExpr?: string },
    ): { sql: string; params: Record<string, unknown> } => {
      const { clauses, params } = buildClauses(prefix, opts);
      if (clauses.length === 0) return { sql: "", params: {} };
      return { sql: `WHERE ${clauses.join(" AND ")}`, params };
    };

    const buildAnd = (
      prefix = "",
      opts?: { timePrefix?: string; timeField?: string; timeExpr?: string },
    ): { sql: string; params: Record<string, unknown> } => {
      const { clauses, params } = buildClauses(prefix, opts);
      if (clauses.length === 0) return { sql: "", params: {} };
      return { sql: `AND ${clauses.join(" AND ")}`, params };
    };

    const wInit = buildWhere("i.", {
      timeExpr: "julianday(replace(i.updatetime, ',', '.'))",
    });
    const totalTasks = Number((this.db.prepare(`SELECT COUNT(*) as count FROM poi_init i ${wInit.sql}`).get(wInit.params) as { count: number }).count);

    const verifyStatusCounts = (
      this.db
        .prepare(`SELECT COALESCE(verify_status,'未知状态') as status, COUNT(*) as count FROM poi_init i ${wInit.sql} GROUP BY verify_status ORDER BY count DESC`)
        .all(wInit.params) as Array<{ status: string; count: number }>
    ).map((item) => ({ status: item.status, count: Number(item.count) }));

    const wStageLatest = buildWhere("", { timeField: "started_at" });
    const wStage = buildWhere("i.", {
      timeExpr: "julianday(replace(COALESCE(q.qc_time, v.verify_time, i.updatetime), ',', '.'))",
    });
    const flowStageCounts = (
      this.db
        .prepare(`
          WITH latest AS (
            SELECT *
            FROM poi_task_analysis
            WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wStageLatest.sql} GROUP BY task_id, phase)
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
          ${wStage.sql}
          GROUP BY stage
        `)
        .all({ ...wStageLatest.params, ...wStage.params }) as Array<{ stage: string; count: number }>
    ).map((item) => ({ stage: item.stage, count: Number(item.count) }));

    const wMetrics = buildWhere("", { timeField: "started_at" });
    const metricsRows = this.db
      .prepare(`
        WITH latest AS (
          SELECT *
          FROM poi_task_analysis
          WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wMetrics.sql} GROUP BY task_id, phase)
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
      .all(wMetrics.params) as Array<Record<string, unknown>>;

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

    const wVerifyRate = buildWhere("v.", {
      timeExpr: "julianday(replace(v.verify_time, ',', '.'))",
    });
    const verifyRateRow = this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN COALESCE(verify_result, '') = '需人工核实' THEN 1 ELSE 0 END) AS manual_count,
          SUM(CASE WHEN COALESCE(verify_result, '') != '' THEN 1 ELSE 0 END) AS verified_total
        FROM poi_verified v
        ${wVerifyRate.sql}
      `)
      .get(wVerifyRate.params) as { manual_count: number | null; verified_total: number | null };
    const verifiedTotal = Number(verifyRateRow.verified_total ?? 0);
    const manualCount = Number(verifyRateRow.manual_count ?? 0);
    verifyMetrics.automationRate = verifiedTotal > 0 ? Math.max(0, 1 - manualCount / verifiedTotal) : 0;

    const wQcQuality = buildWhere("q.", {
      timeExpr: "julianday(replace(q.qc_time, ',', '.'))",
    });
    const qualityRow = this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN q.is_qualified = 1 THEN 1 ELSE 0 END) AS matched_count,
          SUM(CASE WHEN q.is_qualified IS NOT NULL THEN 1 ELSE 0 END) AS qc_total
        FROM poi_qc q
        LEFT JOIN poi_verified v ON v.task_id = q.task_id
        ${wQcQuality.sql}
      `)
      .get(wQcQuality.params) as { matched_count: number | null; qc_total: number | null };
    const qualityMatched = Number(qualityRow.matched_count ?? 0);
    const qcTotal = Number(qualityRow.qc_total ?? 0);
    qcMetrics.verificationQualityRate = qcTotal > 0 ? qualityMatched / qcTotal : 0;

    const aManual = buildAnd("i.", {
      timeExpr: "julianday(replace(COALESCE(q.qc_time, v.verify_time, i.updatetime), ',', '.'))",
    });
    const manualTaskCount = Number(
      (
        this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM poi_init i
            LEFT JOIN poi_verified v ON v.task_id = i.task_id
            LEFT JOIN poi_qc q ON q.task_id = i.task_id
            WHERE (COALESCE(v.verify_result, '') = '${VERIFY_MANUAL}'
               OR COALESCE(q.is_qualified, 0) = 0)
               ${aManual.sql}
          `)
          .get(aManual.params) as { count: number }
      ).count,
    );

    const wAnomalyLatest = buildWhere("", { timeField: "started_at" });
    const aAnomaly = buildAnd("i.", {
      timeExpr: "julianday(replace(COALESCE(q.qc_time, v.verify_time, i.updatetime), ',', '.'))",
    });
    const anomalyCount = Number(
      (
        this.db
          .prepare(`
            WITH latest AS (
              SELECT *
              FROM poi_task_analysis
              WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wAnomalyLatest.sql} GROUP BY task_id, phase)
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
              (
                vr.task_id IS NOT NULL
                AND v.verify_status IS NOT NULL
                AND (
                  (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                  OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                )
              )
              OR (
                qr.task_id IS NOT NULL
                AND q.qc_status IS NOT NULL
                AND qr.status <> 'success'
              )
            ) ${aAnomaly.sql}
          `)
          .get({ ...wAnomalyLatest.params, ...aAnomaly.params }) as { count: number }
      ).count,
    );

    const aQcRejected = buildAnd("q.", {
      timeExpr: "julianday(replace(q.qc_time, ',', '.'))",
    });
    const qcRejectedCount = Number(
      (
        this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM poi_qc q
            WHERE is_qualified = 0 ${aQcRejected.sql}
          `)
          .get(aQcRejected.params) as { count: number }
      ).count,
    );

    const timeBlockExpr =
      granularity === "day"
        ? "strftime('%Y-%m-%d', replace(time_val, ',', '.'))"
        : granularity === "five_hour"
          ? "strftime('%Y-%m-%d ', replace(time_val, ',', '.')) || printf('%02d:00', (CAST(strftime('%H', replace(time_val, ',', '.')) AS INTEGER) / 5) * 5)"
          : "strftime('%Y-%m-%d %H:00', replace(time_val, ',', '.'))";

    const wTimeSeriesLatest = buildWhere("", { timeField: "started_at" });
    const aTimeSeriesVerify = buildAnd("i.", {
      timeExpr: "julianday(replace(COALESCE(vr.started_at, v.verify_time), ',', '.'))",
    });
    const aTimeSeriesQc = buildAnd("i.", {
      timeExpr: "julianday(replace(COALESCE(qr.started_at, q.qc_time), ',', '.'))",
    });
    const rows = (this.db.prepare(`
      WITH latest AS (
        SELECT task_id, phase, started_at
        FROM poi_task_analysis
        ${wTimeSeriesLatest.sql}
      ),
      latest_grouped AS (
        SELECT task_id, phase, MAX(started_at) as started_at
        FROM latest
        GROUP BY task_id, phase
      ),
      base_times AS (
        SELECT 'verify' as phase, COALESCE(vr.started_at, v.verify_time) as time_val
        FROM poi_init i
        LEFT JOIN poi_verified v ON i.task_id = v.task_id
        LEFT JOIN (SELECT task_id, started_at FROM latest_grouped WHERE phase = 'verify') vr ON vr.task_id = i.task_id
        WHERE COALESCE(vr.started_at, v.verify_time) IS NOT NULL
        ${aTimeSeriesVerify.sql}

        UNION ALL

        SELECT 'qc' as phase, COALESCE(qr.started_at, q.qc_time) as time_val
        FROM poi_init i
        LEFT JOIN poi_qc q ON i.task_id = q.task_id
        LEFT JOIN (SELECT task_id, started_at FROM latest_grouped WHERE phase = 'qc') qr ON qr.task_id = i.task_id
        WHERE COALESCE(qr.started_at, q.qc_time) IS NOT NULL
        ${aTimeSeriesQc.sql}
      ),
      blocks AS (
        SELECT
          phase,
          ${timeBlockExpr} as time_block
        FROM base_times
      )
      SELECT time_block,
             SUM(CASE WHEN phase = 'verify' THEN 1 ELSE 0 END) as verify_count,
             SUM(CASE WHEN phase = 'qc' THEN 1 ELSE 0 END) as qc_count
      FROM blocks
      WHERE time_block IS NOT NULL AND time_block != ''
      GROUP BY time_block
      ORDER BY time_block ASC
    `).all({
      ...wTimeSeriesLatest.params,
      ...aTimeSeriesVerify.params,
      ...aTimeSeriesQc.params,
    }) as Array<{ time_block: string; verify_count: number; qc_count: number }>);

    const timeSeries = rows.map((row) => ({
      timeBlock: row.time_block,
      verifyCount: Number(row.verify_count),
      qcCount: Number(row.qc_count),
    }));

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
      timeSeries,
    };
  }

  async getTaskList(filters: DashboardFilters): Promise<TaskListResult> {
    const { whereSql, params } = buildTaskFilterSql(filters);

    const baseSql = `
      WITH latest AS (
        SELECT *
        FROM poi_task_analysis
        WHERE id IN (SELECT MAX(id) FROM poi_task_analysis GROUP BY task_id, phase)
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
          i.updatetime,
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
          COALESCE(q.qc_time, v.verify_time, i.updatetime) AS latest_action_time,
          CASE
            WHEN q.qc_time IS NOT NULL AND q.qc_time != '' THEN 'qc'
            WHEN v.verify_time IS NOT NULL AND v.verify_time != '' THEN 'verify'
            WHEN i.updatetime IS NOT NULL AND i.updatetime != '' THEN 'init'
            ELSE NULL
          END AS latest_action_type,

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
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
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
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
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

    const sql = `
      SELECT *
      FROM (${baseSql}) t
      ORDER BY
        (CASE WHEN (t.latest_action_time IS NULL OR t.latest_action_time = '') THEN 0 ELSE 1 END) DESC,
        julianday(replace(t.latest_action_time, ',', '.')) DESC,
        t.task_id DESC
      LIMIT @limit OFFSET @offset
    `;
    const rows = this.db
      .prepare(sql)
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
        SELECT phase, session_ids_json, import_batch_id, started_at, ended_at, duration_ms, status
        FROM poi_task_analysis
        WHERE task_id = ?
          AND id IN (
            SELECT MAX(id)
            FROM poi_task_analysis
            WHERE task_id = ?
            GROUP BY task_id, phase
          )
      `)
      .all(taskId, taskId) as Array<Record<string, unknown>>;

    const verifyRun = runRows.find((row) => row.phase === "verify");
    const qcRun = runRows.find((row) => row.phase === "qc");
    const verifyImportBatchId = String(verifyRun?.import_batch_id ?? "") || null;
    const qcImportBatchId = String(qcRun?.import_batch_id ?? "") || null;
    const verifyImportRow = verifyImportBatchId
      ? (this.db.prepare("SELECT verify_claude_log FROM analysis_imports WHERE import_batch_id = ? LIMIT 1").get(verifyImportBatchId) as Record<string, unknown> | undefined)
      : undefined;
    const qcImportRow = qcImportBatchId
      ? (this.db.prepare("SELECT qc_claude_log FROM analysis_imports WHERE import_batch_id = ? LIMIT 1").get(qcImportBatchId) as Record<string, unknown> | undefined)
      : undefined;
    const businessRow = this.db
      .prepare(`
        SELECT v.verify_time, q.qc_time
        FROM poi_init i
        LEFT JOIN poi_verified v ON v.task_id = i.task_id
        LEFT JOIN poi_qc q ON q.task_id = i.task_id
        WHERE i.task_id = ?
        LIMIT 1
      `)
      .get(taskId) as Record<string, unknown> | undefined;

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
      verifySummary: {
        startedAt: (verifyRun?.started_at as string | null) ?? null,
        endedAt: (verifyRun?.ended_at as string | null) ?? null,
        businessTime: (businessRow?.verify_time as string | null) ?? null,
        durationMs: Number(verifyRun?.duration_ms ?? 0),
        status: (verifyRun?.status as string | null) ?? null,
      },
      qcSummary: {
        startedAt: (qcRun?.started_at as string | null) ?? null,
        endedAt: (qcRun?.ended_at as string | null) ?? null,
        businessTime: (businessRow?.qc_time as string | null) ?? null,
        durationMs: Number(qcRun?.duration_ms ?? 0),
        status: (qcRun?.status as string | null) ?? null,
      },
    };
  }

  async getBatches(): Promise<BatchOverviewItem[]> {
    const rows = this.db.prepare(`
      WITH latest AS (
        SELECT *
        FROM poi_task_analysis
        WHERE id IN (SELECT MAX(id) FROM poi_task_analysis GROUP BY task_id, phase)
      ),
      verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
      qc_runs AS (SELECT * FROM latest WHERE phase = 'qc'),
      merged AS (
        SELECT
          i.task_id,
          v.verify_result,
          q.is_qualified,
          CASE
            WHEN (
              (vr.task_id IS NOT NULL AND v.verify_status IS NOT NULL AND (
                (vr.status = 'success' AND v.verify_status NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
              ))
              OR (qr.task_id IS NOT NULL AND q.qc_status IS NOT NULL AND qr.status <> 'success')
            ) THEN 1
            ELSE 0
          END AS has_anomaly,
          vr.duration_ms AS vr_duration,
          qr.duration_ms AS qr_duration,
          vr.total_input_tokens AS vr_in_tok,
          vr.total_output_tokens AS vr_out_tok,
          vr.total_cache_tokens AS vr_cache_tok,
          qr.total_input_tokens AS qr_in_tok,
          qr.total_output_tokens AS qr_out_tok,
          qr.total_cache_tokens AS qr_cache_tok,
          vr.started_at AS vr_started,
          vr.ended_at AS vr_ended,
          qr.started_at AS qr_started,
          qr.ended_at AS qr_ended,
          vr.status AS vr_status,
          qr.status AS qr_status,
          v.task_id AS is_verified
        FROM poi_init i
        LEFT JOIN poi_verified v ON v.task_id = i.task_id
        LEFT JOIN poi_qc q ON q.task_id = i.task_id
        LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
        LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
      )
      SELECT * FROM merged
    `).all() as Array<Record<string, unknown>>;

    interface BatchInternalState {
      batchId: string;
      taskCount: number;
      manualTaskCount: number;
      anomalyCount: number;
      qcTaskCount: number;
      qcRejectedCount: number;
      totalDurationMs: number;
      totalTokens: number;
      minStarted: string | null;
      maxEnded: string | null;
      anyTaskStarted: boolean;
      allTasksCompleted: boolean;
      verifiedTotal: number;
    }
    const batchMap = new Map<string, BatchInternalState>();

    for (const row of rows) {
      const taskId = String(row.task_id);
      let batchId = "default";
      const match = taskId.match(/_([^_]+_[0-9]+)$/);
      if (match) {
        batchId = match[1];
      } else {
        const parts = taskId.split('_');
        if (parts.length >= 2) {
          batchId = parts.slice(-2).join('_');
        } else {
          batchId = taskId;
        }
      }

      let item = batchMap.get(batchId);
      if (!item) {
        item = { 
          batchId, taskCount: 0, manualTaskCount: 0, anomalyCount: 0, 
          qcTaskCount: 0, qcRejectedCount: 0, totalDurationMs: 0, totalTokens: 0,
          minStarted: null, maxEnded: null, anyTaskStarted: false, allTasksCompleted: true, verifiedTotal: 0
        };
        batchMap.set(batchId, item);
      }

      item.taskCount++;

      const isManual = (row.verify_result === VERIFY_MANUAL) || (row.is_qualified != null ? !boolish(row.is_qualified) : false);
      if (isManual) item.manualTaskCount++;
      if (row.has_anomaly === 1) item.anomalyCount++;
      if (row.is_verified != null) item.verifiedTotal++;
      if (row.is_qualified != null) {
        item.qcTaskCount++;
        if (!boolish(row.is_qualified)) item.qcRejectedCount++;
      }

      // item.totalDurationMs += (Number(row.vr_duration) || 0) + (Number(row.qr_duration) || 0);
      item.totalTokens += (Number(row.vr_in_tok) || 0) + (Number(row.vr_out_tok) || 0) + (Number(row.vr_cache_tok) || 0) +
                           (Number(row.qr_in_tok) || 0) + (Number(row.qr_out_tok) || 0) + (Number(row.qr_cache_tok) || 0);

      const vrStarted = row.vr_started as string | null;
      const qrStarted = row.qr_started as string | null;
      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;

      if (vrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || vrStarted < item.minStarted) item.minStarted = vrStarted;
      }
      if (qrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || qrStarted < item.minStarted) item.minStarted = qrStarted;
      }

      if (vrEnded) {
        if (!item.maxEnded || vrEnded > item.maxEnded) item.maxEnded = vrEnded;
      }
      if (qrEnded) {
        if (!item.maxEnded || qrEnded > item.maxEnded) item.maxEnded = qrEnded;
      }

      if (!vrStarted && !qrStarted) {
        item.allTasksCompleted = false;
      } else {
        const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
        const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
        if (isVrRunning || isQrRunning) {
          item.allTasksCompleted = false;
        }
      }
    }

    const result: BatchOverviewItem[] = Array.from(batchMap.values()).map(b => {
      let status: "pending" | "running" | "completed" = "running";
      if (!b.anyTaskStarted) status = "pending";
      else if (b.allTasksCompleted) status = "completed";
      
      const automationRate = b.verifiedTotal > 0 ? (b.verifiedTotal - b.manualTaskCount) / b.verifiedTotal : 0;
      const qcPassRate = b.qcTaskCount > 0 ? (b.qcTaskCount - b.qcRejectedCount) / b.qcTaskCount : 0;

      const duration = (b.minStarted && b.maxEnded) 
        ? (new Date(b.maxEnded).getTime() - new Date(b.minStarted).getTime())
        : 0;

      return {
        batchId: b.batchId,
        taskCount: b.taskCount,
        manualTaskCount: b.manualTaskCount,
        anomalyCount: b.anomalyCount,
        qcRejectedCount: b.qcRejectedCount,
        totalDurationMs: duration,
        automationRate: Math.max(0, automationRate),
        qcPassRate: Math.max(0, qcPassRate),
        createdAt: b.minStarted,
        completedAt: status === "completed" ? b.maxEnded : null,
        totalTokens: b.totalTokens,
        status
      };
    });

    return result.sort((a, b) => b.batchId.localeCompare(a.batchId));
  }

  hasInitError(): boolean {
    return false;
  }
}
