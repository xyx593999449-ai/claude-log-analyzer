import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  AggregatedTaskRun,
  AnalysisPhase,
  BatchOverviewItem,
  DashboardFilters,
  DashboardTimeGranularity,
  HitlDecisionReasonItem,
  HitlFlowStep,
  HitlIterationDecisionOverview,
  HitlBatchImportCommitResult,
  HitlBatchImportPreviewResponse,
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
} from "./types";
import {
  HITL_IMPORT_TARGET_TABLE,
  buildHitlImportPreview,
  getHitlImportColumnNames,
  type HitlBatchImportPreviewCacheItem,
  HitlImportHttpError,
  validateBatchIdOrThrow,
} from "./importers/hitlBatchCsv";
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

const VERIFY_DONE = "已核实";
const VERIFY_MANUAL = "需人工核实";
const VERIFY_BATCH_CREATED = "生成批次";
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
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNullableText(item)).filter(Boolean) as string[];
  }
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

function quotePgQualifiedName(qualifiedName: string): string {
  return qualifiedName
    .split(".")
    .map((part) => `"${part.replace(/"/g, "\"\"")}"`)
    .join(".");
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

function buildTaskFilterSqlPg(filters: DashboardFilters): { whereSql: string; params: unknown[] } {
  const clauses: string[] = [];
  const alertClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.search) {
    clauses.push(
      `(task_id ILIKE $${idx} OR poi_id ILIKE $${idx} OR name ILIKE $${idx} OR address ILIKE $${idx} OR city ILIKE $${idx})`,
    );
    params.push(`%${filters.search}%`);
    idx += 1;
  }

  if (filters.verifyStatus) {
    clauses.push(`COALESCE(verified_status::text, init_verify_status::text, '') = $${idx}`);
    params.push(filters.verifyStatus);
    idx += 1;
  }

  if (filters.qcStatus) {
    clauses.push(`COALESCE(NULLIF(quality_status::text, ''), NULLIF(qc_status::text, ''), '') = $${idx}`);
    params.push(filters.qcStatus);
    idx += 1;
  }

  if (filters.manualOnly) {
    clauses.push(`(COALESCE(verify_result, '') = '${VERIFY_MANUAL}' OR is_qualified = 0)`);
  }

  if (filters.anomalyOnly) {
    clauses.push("COALESCE(has_anomaly, 0) = 1");
  }

  for (const tag of filters.alertTags) {
    if (tag === "核实阻塞异常") alertClauses.push("COALESCE(verify_retry_count, 0) > 5");
    if (tag === "核实执行异常") alertClauses.push("(verify_task_id IS NOT NULL AND COALESCE(verify_status::text, '') <> 'success' AND COALESCE(verify_retry_count, 0) <= 5)");
    if (tag === "质检阻塞异常") alertClauses.push("COALESCE(qc_retry_count, 0) > 5");
    if (tag === "质检执行异常") alertClauses.push("(qc_task_id IS NOT NULL AND COALESCE(qc_status_run::text, '') <> 'success' AND COALESCE(qc_retry_count, 0) <= 5)");
    if (tag === "需人工介入") alertClauses.push(`(COALESCE(verify_result::text, '') = '${VERIFY_MANUAL}' OR COALESCE(is_qualified, 0) = 0)`);
    if (tag === "质检不通过") alertClauses.push("COALESCE(is_qualified, 0) = 0");
    if (tag === "高风险任务") alertClauses.push("(COALESCE(has_risk, 0) = 1 OR COALESCE(qc_status::text, '') = 'risky')");
    if (tag === "核实状态不一致") alertClauses.push("COALESCE(verify_mismatch_reason::text, '') <> ''");
    if (tag === "质检状态不一致") alertClauses.push("COALESCE(qc_mismatch_reason::text, '') <> ''");
  }

  if (alertClauses.length > 0) {
    clauses.push(`(${alertClauses.join(" OR ")})`);
  }

  if (filters.batches && filters.batches.length > 0) {
    const batchClauses = filters.batches.map((b, i) => `(task_id = $${idx + i * 2} OR task_id LIKE $${idx + i * 2 + 1})`);
    clauses.push(`(${batchClauses.join(" OR ")})`);
    filters.batches.forEach(b => {
      params.push(b);
      params.push(`%\\_${b}`);
    });
    idx += filters.batches.length * 2;
  }

  // 时间段筛选：基于业务最新动作时间（质检时间 > 核实时间 > 初始更新时间）
  if (filters.startTime) {
    clauses.push(`NULLIF(REPLACE(COALESCE(qc_time, verify_time, updatetime::text), ',', '.'), '')::timestamp >= $${idx}::timestamp`);
    params.push(filters.startTime);
    idx += 1;
  }
  if (filters.endTime) {
    clauses.push(`NULLIF(REPLACE(COALESCE(qc_time, verify_time, updatetime::text), ',', '.'), '')::timestamp <= $${idx}::timestamp`);
    params.push(filters.endTime);
    idx += 1;
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
  private hitlTableNamesPromise: Promise<{
    negative: string | null;
    overlay: string | null;
    modification: string | null;
    regression: string | null;
    regressionCompare: string | null;
    regressionResult: string | null;
  }> | null = null;
  private readonly hitlImportPreviewCache = new Map<string, HitlBatchImportPreviewCacheItem>();
  private hitlImportTableNamePromise: Promise<string | null> | null = null;

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

  hasInitError(): boolean {
    return this.initError !== null;
  }

  private async resolveHitlTableName(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      const result = await this.pool.query("SELECT to_regclass($1) AS table_name", [candidate]);
      const tableName = normalizeNullableText(result.rows[0]?.table_name);
      if (tableName) return tableName;
    }
    return null;
  }

  private async getHitlTableNames(): Promise<{
    negative: string | null;
    overlay: string | null;
    modification: string | null;
    regression: string | null;
    regressionCompare: string | null;
    regressionResult: string | null;
  }> {
    if (!this.hitlTableNamesPromise) {
      this.hitlTableNamesPromise = (async () => {
        const negative = await this.resolveHitlTableName([
          "public.t_poi_key_property_check_result_ext_0416",
          "t_poi_key_property_check_result_ext_0416",
          "public.v_hitl_negative_samples",
          "v_hitl_negative_samples",
          "public.iteration_negative_samples",
          "iteration_negative_samples",
          "public.iteration_negative_samples_0415_bak",
          "iteration_negative_samples_0415_bak",
        ]);
        const overlay = await this.resolveHitlTableName([
          "public.iteration_overlay_drafts",
          "iteration_overlay_drafts",
          "public.iteration_overlay_drafts_0415_bak",
          "iteration_overlay_drafts_0415_bak",
        ]);
        const modification = await this.resolveHitlTableName([
          "public.iteration_skill_modifications",
          "iteration_skill_modifications",
          "public.iteration_skill_modifications_0415_bak",
          "iteration_skill_modifications_0415_bak",
        ]);
        const regression = await this.resolveHitlTableName([
          "public.poi_verified_regression_test",
          "poi_verified_regression_test",
        ]);
        const regressionCompare = await this.resolveHitlTableName([
          "public.poi_verified_regression_test_compare",
          "poi_verified_regression_test_compare",
        ]);
        const regressionResult = await this.resolveHitlTableName([
          "public.poi_verified_regression_test_result",
          "poi_verified_regression_test_result",
        ]);
        return { negative, overlay, modification, regression, regressionCompare, regressionResult };
      })();
    }
    return this.hitlTableNamesPromise;
  }

  private buildHitlNegativeFromClause(tableName: string, alias: string): string {
    const quotedTableName = quotePgQualifiedName(tableName);
    const normalizedTableName = tableName.replace(/^public\./, "");
    const isDirectNewTable = normalizedTableName === "t_poi_key_property_check_result_ext_0416";
    if (!isDirectNewTable) {
      return `${quotedTableName} ${alias}`;
    }
    return `(
      SELECT
        task_id,
        id,
        batch_id,
        name_chn AS name,
        addr_chn AS address,
        city,
        poi_type,
        verify_result,
        verify_info::text AS verify_info,
        evidence_record::text AS evidence_record,
        qc_status AS quality_status,
        qc_status,
        qc_result::text AS qc_result,
        qc_result ->> 'qc_score' AS qc_score,
        qc_result ->> 'has_risk' AS has_risk,
        qc_result -> 'statistics_flags' ->> 'is_qualified' AS is_qualified,
        qc_result -> 'statistics_flags' ->> 'is_manual_required' AS is_manual_required,
        create_time::text AS updatetime,
        NULL::text AS qc_time,
        verify_content_is_correct,
        verify_action_is_correct,
        qc_intercept_is_correct,
        evidence_status,
        issue_observation_tags,
        judgment_dimension_tags,
        manual_comment,
        conflicting_evidence,
        manual_added_evidence_url,
        manual_added_evidence_type,
        manual_added_evidence_abstract,
        verified_name,
        verified_address AS verified_addr,
        verified_poi_type,
        verified_city_adcode
      FROM ${quotedTableName}
    ) ${alias}`;
  }

  private async getHitlImportTableName(): Promise<string | null> {
    if (!this.hitlImportTableNamePromise) {
      this.hitlImportTableNamePromise = this.resolveHitlTableName([
        HITL_IMPORT_TARGET_TABLE,
        "t_poi_key_property_check_result_ext_0416",
      ]);
    }
    return this.hitlImportTableNamePromise;
  }

  private clearExpiredHitlImportPreviewCache(): void {
    const now = Date.now();
    for (const [token, item] of this.hitlImportPreviewCache.entries()) {
      if (item.expiresAt <= now) {
        this.hitlImportPreviewCache.delete(token);
      }
    }
  }

  private async ensureUniqueHitlBatchId(batchId: string, client?: PoolClient): Promise<void> {
    const tableName = await this.getHitlImportTableName();
    if (!tableName) {
      throw new HitlImportHttpError(500, `目标表不存在: ${HITL_IMPORT_TARGET_TABLE}`);
    }
    const queryClient = client ?? this.pool;
    const quotedTableName = quotePgQualifiedName(tableName);
    const result = await queryClient.query(`SELECT 1 FROM ${quotedTableName} WHERE batch_id = $1 LIMIT 1`, [batchId]);
    if (result.rowCount && result.rowCount > 0) {
      throw new HitlImportHttpError(400, "batch_id 已存在，请更换后重试");
    }
  }

  private async getOverlayByBatch(batchId: string): Promise<Record<string, unknown> | null> {
    const { overlay } = await this.getHitlTableNames();
    if (!overlay) return null;
    const overlayTable = quotePgQualifiedName(overlay);
    const result = await this.pool.query(
      `SELECT batch_id, overlay_draft, prompt_paths, prompts FROM ${overlayTable} WHERE batch_id = $1 LIMIT 1`,
      [batchId],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
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

  private async getRegressionRunSummaries(batchId: string): Promise<RegressionRunSummaryRow[]> {
    const { regressionResult } = await this.getHitlTableNames();
    if (!regressionResult) return [];
    const regressionResultTable = quotePgQualifiedName(regressionResult);
    const result = await this.pool.query(
      `SELECT
         batch_id, dataset_name, updatetime::text AS updatetime, timestamp_suffix,
         total_count, positive_count, negative_count,
         verify_better_ratio, verify_worsen_ratio,
         qc_better_ratio, qc_worsen_ratio
       FROM ${regressionResultTable}
       WHERE batch_id = $1`,
      [batchId],
    );
    return result.rows as RegressionRunSummaryRow[];
  }

  private async selectRegressionRun(
    batchId: string,
    runId?: string,
    datasetName?: string,
    runAt?: string,
  ): Promise<RegressionRunSummaryRow | null> {
    const rows = (await this.getRegressionRunSummaries(batchId)).sort(compareByRunTimeDesc);
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

  private async buildRegressionOverview(batchId: string): Promise<HitlIterationRegressionOverview | null> {
    const selected = await this.selectRegressionRun(batchId);
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

  private async getRegressionCompareRows(
    batchId: string,
    selectedRun: RegressionRunSummaryRow,
  ): Promise<Array<Record<string, unknown>>> {
    const { regressionCompare } = await this.getHitlTableNames();
    if (!regressionCompare) return [];
    const regressionCompareTable = quotePgQualifiedName(regressionCompare);
    const datasetName = normalizeNullableText(selectedRun.dataset_name);
    const runId = normalizeNullableText(selectedRun.timestamp_suffix);
    const result = datasetName
      ? await this.pool.query(
          `SELECT * FROM ${regressionCompareTable} WHERE batch_id = $1 AND dataset_name = $2`,
          [batchId, datasetName],
        )
      : await this.pool.query(`SELECT * FROM ${regressionCompareTable} WHERE batch_id = $1`, [batchId]);
    const rows = result.rows as Array<Record<string, unknown>>;
    return rows
      .filter((row) => {
        if (!runId) return true;
        return (normalizeNullableText(row.task_id) ?? "").includes(runId);
      })
      .sort(compareByRunTimeDesc);
  }

  private async getRegressionSampleRows(
    batchId: string,
    selectedRun: RegressionRunSummaryRow,
  ): Promise<Array<Record<string, unknown>>> {
    const { regression } = await this.getHitlTableNames();
    if (!regression) return [];
    const regressionTable = quotePgQualifiedName(regression);
    const datasetName = normalizeNullableText(selectedRun.dataset_name);
    const runId = normalizeNullableText(selectedRun.timestamp_suffix);
    const result = datasetName
      ? await this.pool.query(
          `SELECT * FROM ${regressionTable} WHERE batch_id = $1 AND dataset_name = $2`,
          [batchId, datasetName],
        )
      : await this.pool.query(`SELECT * FROM ${regressionTable} WHERE batch_id = $1`, [batchId]);
    const rows = result.rows as Array<Record<string, unknown>>;
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
      CREATE TABLE IF NOT EXISTS poi_task_analysis (
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

      CREATE TABLE IF NOT EXISTS public.poi_claude_log (
        task_id varchar NOT NULL,
        session_id varchar NOT NULL,
        log_detail jsonb NULL,
        updatetime timestamp NULL,
        CONSTRAINT poi_claude_log_pk PRIMARY KEY (task_id, session_id)
      );
    `);

    const hitlImportTableName = await this.getHitlImportTableName();
    if (hitlImportTableName) {
      const quotedTableName = quotePgQualifiedName(hitlImportTableName);
      await this.pool.query(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS batch_id varchar(255)`);
      await this.pool.query(`ALTER TABLE ${quotedTableName} ADD COLUMN IF NOT EXISTS verify_info jsonb`);
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_t_poi_key_property_check_result_ext_0416_batch_id ON ${quotedTableName} (batch_id)`,
      );
    }
  }

  /*
  注释废弃的写入逻辑，转为纯读取展示
  async clearAnalysisCache(): Promise<{ deletedRows: number; deletedImports: number }> {
    await this.ready();
    const deletedRows = await this.pool.query("DELETE FROM poi_task_analysis");
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
          INSERT INTO poi_task_analysis (
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
  */

  nextImportBatchId(): string {
    return `IMPORT_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  async previewHitlIterationImport(params: {
    batchId: string;
    fileName: string;
    fileBuffer: Buffer;
  }): Promise<HitlBatchImportPreviewResponse> {
    await this.ready();
    this.clearExpiredHitlImportPreviewCache();

    const batchId = validateBatchIdOrThrow(params.batchId);
    await this.ensureUniqueHitlBatchId(batchId);

    const previewItem = buildHitlImportPreview({
      batchId,
      fileName: params.fileName,
      fileBuffer: params.fileBuffer,
    });
    const previewToken = randomUUID();
    this.hitlImportPreviewCache.set(previewToken, previewItem);

    return {
      batchId: previewItem.batchId,
      fileName: previewItem.fileName,
      totalRows: previewItem.rows.length,
      validRows: previewItem.rows.length,
      previewToken,
      columns: previewItem.columns,
      previewRows: previewItem.previewRows,
    };
  }

  async importHitlIterationBatch(previewToken: string): Promise<HitlBatchImportCommitResult> {
    await this.ready();
    this.clearExpiredHitlImportPreviewCache();

    const token = previewToken.trim();
    if (!token) {
      throw new HitlImportHttpError(400, "previewToken 为必填项");
    }
    const previewItem = this.hitlImportPreviewCache.get(token);
    if (!previewItem || previewItem.expiresAt <= Date.now()) {
      this.hitlImportPreviewCache.delete(token);
      throw new HitlImportHttpError(400, "previewToken 无效或已过期，请重新上传文件");
    }

    const tableName = await this.getHitlImportTableName();
    if (!tableName) {
      throw new HitlImportHttpError(500, `目标表不存在: ${HITL_IMPORT_TARGET_TABLE}`);
    }
    const quotedTableName = quotePgQualifiedName(tableName);
    const columns = getHitlImportColumnNames();
    const columnSql = columns
      .map((column) => `"${column.replace(/"/g, "\"\"")}"`)
      .join(", ");
    const placeholderSql = columns.map((_, index) => `$${index + 1}`).join(", ");
    const insertSql = `INSERT INTO ${quotedTableName} (${columnSql}) VALUES (${placeholderSql})`;
    const createdAt = new Date().toISOString();

    await this.withTx(async (client) => {
      await this.ensureUniqueHitlBatchId(previewItem.batchId, client);
      for (const row of previewItem.rows) {
        const values = columns.map((column) => {
          const value = row.values[column];
          if (value == null) return null;
          if (typeof value === "object") return JSON.stringify(value);
          return value;
        });
        await client.query(insertSql, values);
      }
    });

    this.hitlImportPreviewCache.delete(token);
    return {
      batchId: previewItem.batchId,
      insertedCount: previewItem.rows.length,
      createdAt,
    };
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
      `
        SELECT DISTINCT COALESCE(v.verify_status::text, i.verify_status::text, '') as status
        FROM poi_init i
        LEFT JOIN poi_verified v ON v.task_id = i.task_id
        WHERE COALESCE(v.verify_status::text, i.verify_status::text, '') != ''
        ORDER BY status
      `,
    );
    const qcStatusesRes = await this.pool.query(
      `
        SELECT DISTINCT COALESCE(NULLIF(quality_status::text, ''), NULLIF(qc_status::text, ''), '') as status
        FROM poi_qc
        WHERE COALESCE(NULLIF(quality_status::text, ''), NULLIF(qc_status::text, ''), '') != ''
        ORDER BY status
      `,
    );
    return {
      verifyStatuses: verifyStatusesRes.rows.map((row) => String(row.status)),
      qcStatuses: qcStatusesRes.rows.map((row) => String(row.status)),
    };
  }

  async getOverview(
    batches?: string[],
    startTime?: string,
    endTime?: string,
    granularity: DashboardTimeGranularity = "hour",
  ): Promise<DashboardOverview> {
    await this.ready();

    // 构建 WHERE 子句辅助函数，同时包含批次过滤和时间段过滤
    // prefix: 表别名前缀（如 "i."），timePrefix: 用于时间过滤的表别名前缀组合
    const buildWhere = (prefix = "", opts?: { timePrefix?: string; timeField?: string }) => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (batches && batches.length > 0) {
        const batchClauses = batches.map((b, i) => `(${prefix}task_id = $${idx + i * 2} OR ${prefix}task_id LIKE $${idx + i * 2 + 1})`);
        clauses.push(`(${batchClauses.join(" OR ")})`);
        batches.forEach(b => {
          params.push(b);
          params.push(`%\\_${b}`);
        });
        idx += batches.length * 2;
      }

      // 时间段过滤：仅当有时间参数时才注入
      const tf = opts?.timeField || "started_at";
      const tp = opts?.timePrefix || "";
      if (startTime) {
        clauses.push(`NULLIF(REPLACE(${tp}${tf}::text, ',', '.'), '')::timestamp >= $${idx}::timestamp`);
        params.push(startTime);
        idx += 1;
      }
      if (endTime) {
        clauses.push(`NULLIF(REPLACE(${tp}${tf}::text, ',', '.'), '')::timestamp <= $${idx}::timestamp`);
        params.push(endTime);
        idx += 1;
      }

      if (clauses.length === 0) return { sql: "", params: [] as unknown[] };
      return { sql: `WHERE ${clauses.join(" AND ")}`, params };
    };
    
    const buildAnd = (prefix = "", opts?: { timePrefix?: string; timeField?: string }) => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (batches && batches.length > 0) {
        const batchClauses = batches.map((b, i) => `(${prefix}task_id = $${idx + i * 2} OR ${prefix}task_id LIKE $${idx + i * 2 + 1})`);
        clauses.push(`(${batchClauses.join(" OR ")})`);
        batches.forEach(b => {
          params.push(b);
          params.push(`%\\_${b}`);
        });
        idx += batches.length * 2;
      }

      const tf = opts?.timeField || "started_at";
      const tp = opts?.timePrefix || "";
      if (startTime) {
        clauses.push(`NULLIF(REPLACE(${tp}${tf}::text, ',', '.'), '')::timestamp >= $${idx}::timestamp`);
        params.push(startTime);
        idx += 1;
      }
      if (endTime) {
        clauses.push(`NULLIF(REPLACE(${tp}${tf}::text, ',', '.'), '')::timestamp <= $${idx}::timestamp`);
        params.push(endTime);
        idx += 1;
      }

      if (clauses.length === 0) return { sql: "", params: [] as unknown[] };
      return { sql: `AND ${clauses.join(" AND ")}`, params };
    };

    // 总任务数（poi_init 不受时间段过滤影响，保持与原有逻辑一致）
    const wInitNt = buildWhere("i.", { timeField: "updatetime", timePrefix: "i." });
    const totalTasksRes = await this.pool.query(`SELECT COUNT(*)::bigint as count FROM poi_init i ${wInitNt.sql}`, wInitNt.params);
    const totalTasks = Number(totalTasksRes.rows[0]?.count ?? 0);

    const wInitNt2 = buildWhere("i.", { timeField: "updatetime", timePrefix: "i." });
    const verifyStatusCountsRes = await this.pool.query(
      `SELECT COALESCE(verify_status::text,'未知状态') as status, COUNT(*)::bigint as count FROM poi_init i ${wInitNt2.sql} GROUP BY verify_status ORDER BY count DESC`,
      wInitNt2.params
    );
    const verifyStatusCounts = verifyStatusCountsRes.rows.map((item) => ({
      status: String(item.status),
      count: Number(item.count ?? 0),
    }));

    // 流程阶段计数（涉及多表联查，时间过滤应用于日志表 started_at）
    const wStage = buildWhere("i.", { timeField: "updatetime", timePrefix: "i." });
    const wStageInner = buildWhere("", { timeField: "started_at" });
    const flowStageCountsRes = await this.pool.query(`
      WITH latest AS (
        SELECT *
        FROM poi_task_analysis
        WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wStageInner.sql} GROUP BY task_id, phase)
      ),
      verify_runs AS (SELECT * FROM latest WHERE phase = 'verify'),
      qc_runs AS (SELECT * FROM latest WHERE phase = 'qc')
      SELECT
        CASE
          WHEN q.is_qualified IS NOT NULL
            OR COALESCE(q.quality_status::text, '') = '已质检'
            OR COALESCE(q.qc_status::text, '') != ''
          THEN 'qc_done'
          WHEN qr.task_id IS NOT NULL
            OR COALESCE(q.quality_status::text, '') = '质检中'
          THEN 'qc_running'
          WHEN vr.status = 'success'
            OR COALESCE(v.verify_status::text, '') != ''
            OR COALESCE(v.verify_result::text, '') != ''
          THEN 'verified_waiting_qc'
          WHEN vr.task_id IS NOT NULL
          THEN 'verifying'
          ELSE 'pending_verify'
        END AS stage,
        COUNT(*)::bigint AS count
      FROM poi_init i
      LEFT JOIN poi_verified v ON v.task_id = i.task_id
      LEFT JOIN poi_qc q ON q.task_id = i.task_id
      LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
      LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
      ${wStage.sql}
      GROUP BY stage
    `, wStage.params);
    const flowStageCounts = flowStageCountsRes.rows.map((item) => ({
      stage: String(item.stage),
      count: Number(item.count ?? 0),
    }));

    // 执行指标（基于 poi_task_analysis，时间过滤通过 started_at）
    const wMetrics = buildWhere("", { timeField: "started_at" });
    const metricsRowsRes = await this.pool.query(`
      WITH latest AS (
        SELECT *
        FROM poi_task_analysis
        WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wMetrics.sql} GROUP BY task_id, phase)
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
    `, wMetrics.params);

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

    // 核实自动化率（基于 poi_verified，时间过滤通过 verify_time）
    const wVerifyRate = buildWhere("v.", { timeField: "verify_time", timePrefix: "v." });
    const verifyRateRes = await this.pool.query(`
      SELECT
        SUM(CASE WHEN COALESCE(verify_result, '') = '需人工核实' THEN 1 ELSE 0 END)::bigint AS manual_count,
        SUM(CASE WHEN COALESCE(verify_result, '') != '' THEN 1 ELSE 0 END)::bigint AS verified_total
      FROM poi_verified v
      ${wVerifyRate.sql}
    `, wVerifyRate.params);
    const verifyRateRow = verifyRateRes.rows[0] as Record<string, unknown>;
    const verifiedTotal = Number(verifyRateRow?.verified_total ?? 0);
    const manualCount = Number(verifyRateRow?.manual_count ?? 0);
    verifyMetrics.automationRate = verifiedTotal > 0 ? Math.max(0, 1 - manualCount / verifiedTotal) : 0;

    // 质检合格率（基于 poi_qc，时间过滤通过 qc_time）
    const wQcQuality = buildWhere("q.", { timeField: "qc_time", timePrefix: "q." });
    const qualityRes = await this.pool.query(`
      SELECT
        SUM(CASE WHEN q.is_qualified = 1 THEN 1 ELSE 0 END)::bigint AS matched_count,
        SUM(CASE WHEN q.is_qualified IS NOT NULL THEN 1 ELSE 0 END)::bigint AS qc_total
      FROM poi_qc q
      LEFT JOIN poi_verified v ON v.task_id = q.task_id
      ${wQcQuality.sql}
    `, wQcQuality.params);
    const qualityRow = qualityRes.rows[0] as Record<string, unknown>;
    const qualityMatched = Number(qualityRow?.matched_count ?? 0);
    const qcTotal = Number(qualityRow?.qc_total ?? 0);
    qcMetrics.verificationQualityRate = qcTotal > 0 ? qualityMatched / qcTotal : 0;

    // 人工介入任务数（多表联查，不加时间过滤以保持与总任务数口径一致）
    const aManual = buildAnd("i.", {
      timePrefix: "i.",
      timeField: "updatetime",
    });
    const manualTaskCountRes = await this.pool.query(`
      SELECT COUNT(*)::bigint as count
      FROM poi_init i
      LEFT JOIN poi_verified v ON v.task_id = i.task_id
      LEFT JOIN poi_qc q ON q.task_id = i.task_id
      WHERE (COALESCE(v.verify_result::text, '') = '${VERIFY_MANUAL}'
         OR COALESCE(q.is_qualified, 0) = 0)
         ${aManual.sql}
    `, aManual.params);
    const manualTaskCount = Number(manualTaskCountRes.rows[0]?.count ?? 0);

    // 异常任务数（多表联查，时间过滤通过日志表 started_at）
    const wAnomaly = buildWhere("", { timeField: "started_at" });
    const aAnomaly = buildAnd("i.", {
      timePrefix: "i.",
      timeField: "updatetime",
    });
    const anomalyCountRes = await this.pool.query(`
      WITH latest AS (
        SELECT *
        FROM poi_task_analysis
        WHERE id IN (SELECT MAX(id) FROM poi_task_analysis ${wAnomaly.sql} GROUP BY task_id, phase)
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
        (
          vr.task_id IS NOT NULL
          AND v.verify_status IS NOT NULL
          AND (
            (vr.status = 'success' AND v.verify_status::text NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
            OR (vr.status <> 'success' AND v.verify_status::text IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
          )
        )
        OR (
          qr.task_id IS NOT NULL
          AND q.qc_status IS NOT NULL
          AND qr.status <> 'success'
        )
      ) ${aAnomaly.sql}
    `, aAnomaly.params);
    const anomalyCount = Number(anomalyCountRes.rows[0]?.count ?? 0);

    // 质检不通过数
    const aQcRej = buildAnd("q.", { timeField: "qc_time", timePrefix: "q." });
    const qcRejectedCountRes = await this.pool.query(`
      SELECT COUNT(*)::bigint as count
      FROM poi_qc q
      WHERE is_qualified = 0 ${aQcRej.sql}
    `, aQcRej.params);
    const qcRejectedCount = Number(qcRejectedCountRes.rows[0]?.count ?? 0);

    const timeBlockExpr =
      granularity === "day"
        ? `to_char(date_trunc('day', NULLIF(REPLACE(time_val, ',', '.'), '')::timestamp), 'YYYY-MM-DD')`
        : granularity === "five_hour"
          ? `to_char(
              date_trunc('day', NULLIF(REPLACE(time_val, ',', '.'), '')::timestamp)
              + floor(extract(hour from NULLIF(REPLACE(time_val, ',', '.'), '')::timestamp) / 5) * interval '5 hour',
              'YYYY-MM-DD HH24:00'
            )`
          : `to_char(date_trunc('hour', NULLIF(REPLACE(time_val, ',', '.'), '')::timestamp), 'YYYY-MM-DD HH24:00')`;

    // 时间趋势图（过滤日志和业务时间）
    const wTs = buildWhere("", { timeField: "started_at" });
    const aTsVerify = buildAnd("i.", {
      timeField: "verify_time",
      timePrefix: "v.",
    });
    const aTsQc = buildAnd("i.", {
      timeField: "qc_time",
      timePrefix: "q.",
    });
    const timeSeriesRes = await this.pool.query(`
      WITH latest AS (
        SELECT task_id, phase, started_at
        FROM poi_task_analysis
        ${wTs.sql}
      ),
      latest_grouped AS (
        SELECT task_id, phase, MAX(started_at) as started_at
        FROM latest
        GROUP BY task_id, phase
      ),
      base_times AS (
        SELECT 'verify' as phase, COALESCE(vr.started_at, v.verify_time::text) as time_val
        FROM poi_init i
        LEFT JOIN poi_verified v ON i.task_id = v.task_id
        LEFT JOIN (SELECT task_id, started_at FROM latest_grouped WHERE phase = 'verify') vr ON vr.task_id = i.task_id
        WHERE COALESCE(vr.started_at, v.verify_time::text) IS NOT NULL
        ${aTsVerify.sql}
        
        UNION ALL
        
        SELECT 'qc' as phase, COALESCE(qr.started_at, q.qc_time::text) as time_val
        FROM poi_init i
        LEFT JOIN poi_qc q ON i.task_id = q.task_id
        LEFT JOIN (SELECT task_id, started_at FROM latest_grouped WHERE phase = 'qc') qr ON qr.task_id = i.task_id
        WHERE COALESCE(qr.started_at, q.qc_time::text) IS NOT NULL
        ${aTsQc.sql}
      ),
      blocks AS (
        SELECT 
          phase,
          ${timeBlockExpr} as time_block
        FROM base_times
      )
      SELECT time_block,
             SUM(CASE WHEN phase = 'verify' THEN 1 ELSE 0 END)::bigint as verify_count,
             SUM(CASE WHEN phase = 'qc' THEN 1 ELSE 0 END)::bigint as qc_count
      FROM blocks
      GROUP BY time_block
      ORDER BY time_block ASC
    `, wTs.params);

    const timeSeries = (timeSeriesRes.rows as Array<Record<string, unknown>>).map((r) => ({
      timeBlock: String(r.time_block),
      verifyCount: Number(r.verify_count ?? 0),
      qcCount: Number(r.qc_count ?? 0)
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
    await this.ready();
    const { whereSql, params } = buildTaskFilterSqlPg(filters);

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
          i.verify_status AS init_verify_status,
          i.updatetime,
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
          COALESCE(q.qc_time::text, v.verify_time::text, i.updatetime::text) AS latest_action_time,
          CASE
            WHEN q.qc_time IS NOT NULL THEN 'qc'
            WHEN v.verify_time IS NOT NULL THEN 'verify'
            WHEN i.updatetime IS NOT NULL THEN 'init'
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
                (vr.status = 'success' AND v.verify_status::text NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status::text IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
              )
            THEN ('日志状态(' || COALESCE(vr.status::text,'unknown') || ') 与数据库核实状态(' || COALESCE(v.verify_status::text,'') || ') 不一致')
            ELSE NULL
          END AS verify_mismatch_reason,

          CASE
            WHEN qr.task_id IS NOT NULL
              AND q.qc_status IS NOT NULL
              AND qr.status <> 'success'
            THEN ('日志状态(' || COALESCE(qr.status::text,'unknown') || ') 与数据库质检状态(' || COALESCE(q.qc_status::text,'') || ') 不一致')
            ELSE NULL
          END AS qc_mismatch_reason,

          CASE
            WHEN (
              (vr.task_id IS NOT NULL AND v.verify_status IS NOT NULL AND (
                (vr.status = 'success' AND v.verify_status::text NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status::text IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
              ))
              OR (qr.task_id IS NOT NULL AND q.qc_status IS NOT NULL AND qr.status <> 'success')
            ) THEN 1
            ELSE NULL
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
    // 排序优先级：质检时间 > 核实时间 > 初始更新时间，兼容 null / 空值
    const rowsRes = await this.pool.query(
      `SELECT * FROM (${baseSql}) t
       ORDER BY
         NULLIF(REPLACE(t.latest_action_time, ',', '.'), '')::timestamp DESC NULLS LAST,
         t.task_id DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      pageParams,
    );

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      items: (rowsRes.rows as Array<Record<string, unknown>>).map(normalizeTask),
    };
  }

  async getHitlIterations(): Promise<{ items: HitlIterationListItem[] }> {
    await this.ready();
    const { negative, overlay, modification } = await this.getHitlTableNames();
    if (!negative) return { items: [] };
    const negativeFrom = this.buildHitlNegativeFromClause(negative, "n");
    const rowsRes = await this.pool.query(`
      SELECT
        n.batch_id AS batch_id,
        MIN(NULLIF(TRIM(COALESCE(n.updatetime::text, '')), '')) AS started_at,
        COUNT(*)::bigint AS sample_count,
        SUM(
          CASE WHEN (
            TRIM(COALESCE(n.verify_content_is_correct::text, '')) = '0'
            OR TRIM(COALESCE(n.verify_action_is_correct::text, '')) = '0'
            OR TRIM(COALESCE(n.qc_intercept_is_correct::text, '')) = '0'
            OR (
              LOWER(TRIM(COALESCE(n.evidence_status::text, ''))) NOT IN ('', 'nan', '1', 'pass', 'normal', 'consistent', 'ok', 'true', 'yes')
            )
            OR (
              TRIM(COALESCE(n.issue_observation_tags::text, '')) != '' AND LOWER(TRIM(COALESCE(n.issue_observation_tags::text, ''))) != 'nan'
            )
            OR (
              TRIM(COALESCE(n.judgment_dimension_tags::text, '')) != '' AND LOWER(TRIM(COALESCE(n.judgment_dimension_tags::text, ''))) != 'nan'
            )
          ) THEN 1 ELSE 0 END
        )::bigint AS issue_count
      FROM ${negativeFrom}
      WHERE TRIM(COALESCE(n.batch_id::text, '')) != ''
      GROUP BY n.batch_id
      ORDER BY started_at DESC, n.batch_id DESC
    `);

    const summaryMap = new Map<string, string | null>();
    if (overlay) {
      const overlayTable = quotePgQualifiedName(overlay);
      const summaryRows = await this.pool.query(`SELECT batch_id, overlay_draft FROM ${overlayTable}`);
      for (const row of summaryRows.rows as Array<Record<string, unknown>>) {
        const batchId = normalizeNullableText(row.batch_id);
        if (!batchId) continue;
        const draft = parseLooseJson(row.overlay_draft) as Record<string, unknown> | null;
        summaryMap.set(batchId, normalizeNullableText(draft?.summary) ?? null);
      }
    }

    const modBatchSet = new Set<string>();
    if (modification) {
      const modificationTable = quotePgQualifiedName(modification);
      const modRows = await this.pool.query(
        `SELECT DISTINCT batch_id FROM ${modificationTable} WHERE TRIM(COALESCE(batch_id::text, '')) != ''`,
      );
      for (const row of modRows.rows as Array<Record<string, unknown>>) {
        const batchId = normalizeNullableText(row.batch_id);
        if (batchId) modBatchSet.add(batchId);
      }
    }

    const items = (rowsRes.rows as Array<Record<string, unknown>>).map((row) => {
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
    await this.ready();
    const { negative, modification } = await this.getHitlTableNames();
    if (!negative) return null;
    const negativeFrom = this.buildHitlNegativeFromClause(negative, "n");

    const sampleRowsRes = await this.pool.query(`SELECT * FROM ${negativeFrom} WHERE batch_id = $1`, [batchId]);
    const sampleRows = sampleRowsRes.rows as Array<Record<string, unknown>>;
    if (sampleRows.length === 0) return null;

    const sampleCount = sampleRows.length;
    const issueCount = sampleRows.filter((row) => isIssueRow(row)).length;
    const startedAt = sampleRows
      .map((row) => normalizeNullableText(row.updatetime))
      .filter(Boolean)
      .sort()[0] ?? null;

    const overlayRow = await this.getOverlayByBatch(batchId);
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

    const modifications: HitlModificationItem[] = [];
    if (modification) {
      const modificationTable = quotePgQualifiedName(modification);
      const modRowsRes = await this.pool.query(
        `SELECT target_skill, modified_file, changes, status, created_at::text as created_at
         FROM ${modificationTable}
         WHERE batch_id = $1
         ORDER BY created_at DESC`,
        [batchId],
      );
      for (const row of modRowsRes.rows as Array<Record<string, unknown>>) {
        const changesObj = parseLooseJson(row.changes) as Record<string, unknown> | null;
        const modifiedFilesRaw = Array.isArray(changesObj?.modified_files) ? changesObj.modified_files : [];
        const modifiedFiles = (modifiedFilesRaw as unknown[])
          .map((item) => normalizeNullableText(item))
          .filter(Boolean) as string[];
        const fallbackFile = normalizeNullableText(row.modified_file);
        if (modifiedFiles.length === 0 && fallbackFile) modifiedFiles.push(fallbackFile);
        const targetSkill = normalizeNullableText(row.target_skill) ?? "unknown";
        modifications.push({
          targetSkill,
          targetSkillLabel: getSkillTypeLabel(targetSkill) ?? targetSkill,
          changeSummary: normalizeNullableText(changesObj?.summary),
          modifiedFiles,
          status: normalizeNullableText(row.status),
          createdAt: normalizeNullableText(row.created_at),
        });
      }
    }

    const hasOverlay = Boolean(overlayRow);
    const hasModification = modifications.length > 0;
    const regressionOverview = await this.buildRegressionOverview(batchId);
    const decisionOverview = buildDecisionOverview(await this.selectRegressionRun(batchId));
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
    await this.ready();
    const items = (await this.getRegressionRunSummaries(batchId))
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
    await this.ready();
    const selectedRun = await this.selectRegressionRun(batchId, runId, datasetName, runAt);
    if (!selectedRun) return null;

    const rows = (await this.getRegressionCompareRows(batchId, selectedRun)).map((row) =>
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
    await this.ready();
    const selectedRun = await this.selectRegressionRun(batchId, runId, datasetName, runAt);
    if (!selectedRun) return null;

    const compareRows = await this.getRegressionCompareRows(batchId, selectedRun);
    const compareRow = compareRows.find((row) => {
      const rowSampleId = normalizeNullableText(row.id);
      const rowTaskId = normalizeNullableText(row.task_id);
      if (rowSampleId !== sampleId) return false;
      if (taskId && rowTaskId !== taskId) return false;
      return true;
    });
    if (!compareRow) return null;

    const sampleRows = await this.getRegressionSampleRows(batchId, selectedRun);
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
    await this.ready();
    const { negative } = await this.getHitlTableNames();
    if (!negative) return { items: [] };
    const negativeFrom = this.buildHitlNegativeFromClause(negative, "n");

    const rowsRes = await this.pool.query(
      `SELECT
         task_id, name, address, city, poi_type, verify_result,
         quality_status, qc_status, issue_observation_tags, judgment_dimension_tags,
         manual_comment, updatetime
       FROM ${negativeFrom}
       WHERE batch_id = $1`,
      [batchId],
    );

    const items: HitlIssueTaskListItem[] = (rowsRes.rows as Array<Record<string, unknown>>)
      .map((row) => ({
        taskId: String(row.task_id ?? ""),
        name: normalizeNullableText(row.name),
        address: normalizeNullableText(row.address),
        city: normalizeNullableText(row.city),
        poiType: normalizeNullableText(row.poi_type),
        verifyResult: normalizeNullableText(row.verify_result),
        qualityStatus: normalizeNullableText(row.quality_status),
        qcStatus: normalizeNullableText(row.qc_status),
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
    await this.ready();
    const { negative } = await this.getHitlTableNames();
    if (!negative) return null;
    const negativeFrom = this.buildHitlNegativeFromClause(negative, "n");

    const rowRes = await this.pool.query(
      `SELECT * FROM ${negativeFrom} WHERE batch_id = $1 AND task_id = $2 LIMIT 1`,
      [batchId, taskId],
    );
    const row = rowRes.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const issueObservationTags = parseTagList(row.issue_observation_tags);
    const judgmentDimensionTags = parseTagList(row.judgment_dimension_tags);
    if (!matchIssueType(issueType, issueObservationTags, judgmentDimensionTags)) {
      return null;
    }

    const overlayRow = await this.getOverlayByBatch(batchId);
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

  async getTaskLogDetail(taskId: string): Promise<TaskLogDetail> {
    await this.ready();
    const runRowsRes = await this.pool.query(
      `
      SELECT phase, session_ids_json, import_batch_id, started_at, ended_at, duration_ms, status
      FROM poi_task_analysis
      WHERE task_id = $1
        AND id IN (
          SELECT MAX(id)
          FROM poi_task_analysis
          WHERE task_id = $1
          GROUP BY task_id, phase
        )
      `,
      [taskId],
    );

    const runRows = runRowsRes.rows as Array<Record<string, unknown>>;
    const verifyRun = runRows.find((row) => row.phase === "verify");
    const qcRun = runRows.find((row) => row.phase === "qc");
    const verifySessionIds =
      safeJsonParse<string[]>(String(verifyRun?.session_ids_json ?? "[]")) ?? [];
    const qcSessionIds =
      safeJsonParse<string[]>(String(qcRun?.session_ids_json ?? "[]")) ?? [];

    const businessTimesRes = await this.pool.query(
      `
      SELECT v.verify_time::text AS verify_time, q.qc_time::text AS qc_time
      FROM poi_init i
      LEFT JOIN poi_verified v ON v.task_id = i.task_id
      LEFT JOIN poi_qc q ON q.task_id = i.task_id
      WHERE i.task_id = $1
      LIMIT 1
      `,
      [taskId],
    );
    const businessTimes = businessTimesRes.rows[0] as Record<string, unknown> | undefined;

    /* 
    注释旧的基于 analysis_imports 的本地日志过滤读取逻辑
    const verifyImportBatchId = String(runRows.find((row) => row.phase === "verify")?.import_batch_id ?? "") || null;
    const qcImportBatchId = String(runRows.find((row) => row.phase === "qc")?.import_batch_id ?? "") || null;
    const verifyImportRes = verifyImportBatchId
      ? await this.pool.query("SELECT verify_claude_log FROM analysis_imports WHERE import_batch_id = $1 LIMIT 1", [verifyImportBatchId])
      : { rows: [] as Array<Record<string, unknown>> };
    const qcImportRes = qcImportBatchId
      ? await this.pool.query("SELECT qc_claude_log FROM analysis_imports WHERE import_batch_id = $1 LIMIT 1", [qcImportBatchId])
      : { rows: [] as Array<Record<string, unknown>> };
    const verifyImportRow = verifyImportRes.rows[0] as Record<string, unknown> | undefined;
    const qcImportRow = qcImportRes.rows[0] as Record<string, unknown> | undefined;

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
    */

    // 新的原生流式日志检索
    const rawLogsRes = await this.pool.query(
      "SELECT session_id, log_detail FROM poi_claude_log WHERE task_id = $1",
      [taskId]
    );

    const sessionLogsMap = new Map<string, string>();
    for (const row of rawLogsRes.rows) {
      const sessionId = String(row.session_id);
      let detailLines = "";
      if (row.log_detail) {
        if (Array.isArray(row.log_detail)) {
          detailLines = row.log_detail.map(obj => JSON.stringify(obj)).join("\n");
        } else if (typeof row.log_detail === "string") {
          // 如果已经是字符串，尝试看是否是 JSON 数组字符串
          try {
            const parsed = JSON.parse(row.log_detail);
            if (Array.isArray(parsed)) {
              detailLines = parsed.map(obj => JSON.stringify(obj)).join("\n");
            } else {
              detailLines = row.log_detail;
            }
          } catch {
            detailLines = row.log_detail;
          }
        } else {
          detailLines = JSON.stringify(row.log_detail);
        }
      }
      sessionLogsMap.set(sessionId, detailLines);
    }

    const buildLogText = (sessionIds: string[]) => {
      return sessionIds.map(id => sessionLogsMap.get(id) || "").filter(Boolean).join("\n");
    };

    return {
      taskId,
      verifyRawLog: buildLogText(verifySessionIds),
      qcRawLog: buildLogText(qcSessionIds),
      verifySessionIds,
      qcSessionIds,
      verifySummary: {
        startedAt: (verifyRun?.started_at as string | null) ?? null,
        endedAt: (verifyRun?.ended_at as string | null) ?? null,
        businessTime: (businessTimes?.verify_time as string | null) ?? null,
        durationMs: Number(verifyRun?.duration_ms ?? 0),
        status: (verifyRun?.status as string | null) ?? null,
      },
      qcSummary: {
        startedAt: (qcRun?.started_at as string | null) ?? null,
        endedAt: (qcRun?.ended_at as string | null) ?? null,
        businessTime: (businessTimes?.qc_time as string | null) ?? null,
        durationMs: Number(qcRun?.duration_ms ?? 0),
        status: (qcRun?.status as string | null) ?? null,
      },
    };
  }

  async getBatches(): Promise<BatchOverviewItem[]> {
    await this.ready();
    const rowsRes = await this.pool.query(`
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
          v.verify_status AS bus_vs,
          v.verify_result AS bus_vr,
          q.qc_status AS bus_qs,
          q.quality_status as bus_qys,
          q.is_qualified,
          CASE
            WHEN (
              (vr.task_id IS NOT NULL AND v.verify_status IS NOT NULL AND (
                (vr.status = 'success' AND v.verify_status::text NOT IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
                OR (vr.status <> 'success' AND v.verify_status::text IN ('${VERIFY_DONE}','${VERIFY_MANUAL}','${VERIFY_BATCH_CREATED}'))
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
          COALESCE(NULLIF(qr.batch_id, ''), NULLIF(vr.batch_id, '')) AS run_batch_id,
          v.task_id AS is_verified
        FROM poi_init i
        LEFT JOIN poi_verified v ON v.task_id = i.task_id
        LEFT JOIN poi_qc q ON q.task_id = i.task_id
        LEFT JOIN verify_runs vr ON vr.task_id = i.task_id
        LEFT JOIN qc_runs qr ON qr.task_id = i.task_id
      )
      SELECT * FROM merged
    `);

    const rows = rowsRes.rows as Array<Record<string, unknown>>;
    
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
      const runBatchId =
        row.run_batch_id == null
          ? ""
          : typeof row.run_batch_id === "string"
            ? row.run_batch_id.trim()
            : String(row.run_batch_id).trim();

      let batchId = "";
      const match = taskId.match(/_([^_]+_[0-9]+)$/);
      if (match) {
        batchId = match[1];
      } else {
        const parts = taskId.split("_");
        if (parts.length >= 2) {
          batchId = parts.slice(-2).join("_");
        } else {
          batchId = runBatchId || taskId;
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

      const isManual = (row.bus_vr === VERIFY_MANUAL) || (row.is_qualified != null ? !boolish(row.is_qualified) : false);
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

      const isVerified = row.bus_vr != null || row.bus_vs != null;
      const isQcDone = row.is_qualified != null || row.bus_qs != null || row.bus_qys != null;
      const startedVrTime = row.vr_started as string | null;
      const startedQrTime = row.qr_started as string | null;
      
      if (startedVrTime || startedQrTime || isVerified || isQcDone) {
        item.anyTaskStarted = true;
      }

      if (startedVrTime && (!item.minStarted || (new Date(startedVrTime) < new Date(item.minStarted)))) item.minStarted = String(startedVrTime);
      if (startedQrTime && (!item.minStarted || (new Date(startedQrTime) < new Date(item.minStarted)))) item.minStarted = String(startedQrTime);

      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;
      if (vrEnded && (!item.maxEnded || (new Date(vrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(vrEnded);
      if (qrEnded && (!item.maxEnded || (new Date(qrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(qrEnded);

      const isTaskUnstarted = !startedVrTime && !startedQrTime && !isVerified && !isQcDone;
      const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
      const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
      
      if (isTaskUnstarted || isVrRunning || isQrRunning) {
        item.allTasksCompleted = false;
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
}
