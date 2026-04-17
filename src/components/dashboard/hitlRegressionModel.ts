import type { HitlRegressionDetailResponse, HitlRegressionDiffDirection, HitlRegressionSummary } from "../../lib/dashboardTypes";

export type RegressionPerspective = "verify" | "qc";

type GenericRecord = Record<string, unknown>;

export interface RegressionMetricCardModel {
  perspective: RegressionPerspective;
  title: string;
  subtitle: string;
  betterRatio: number | null;
  worsenRatio: number | null;
  totalCount: number | null;
  positiveCount: number | null;
  negativeCount: number | null;
  datasetName: string | null;
  runAt: string | null;
  runId: string | null;
  sampleCount: number | null;
  statusText: string;
  headline: string;
  summary: string;
}

export interface RegressionDecisionModel {
  status: "launch" | "rollback" | "review";
  title: string;
  summary: string;
  reasons: string[];
  confidenceLabel: string;
}

export interface RegressionDiffRow {
  id: string;
  sampleId: string;
  taskId: string | null;
  sampleType: string | null;
  poiName: string | null;
  isConsistent: boolean | null;
  diffDirection: HitlRegressionDiffDirection;
  primaryOldValue: string | null;
  primaryNewValue: string | null;
  secondaryDiffText: string | null;
  detailPreview: string | null;
  sampleDetailUrl: string;
  raw: Record<string, unknown>;
}

export interface RegressionSummaryGroups {
  metrics: {
    worsenRatio: number | null;
    betterRatio: number | null;
  };
  sampleComposition: {
    totalCount: number;
    positiveCount: number;
    negativeCount: number;
  };
  detailStats: {
    worsenCount: number;
    betterCount: number;
    sameCount: number;
    unknownCount: number;
  };
}

export interface RegressionDetailPageModel {
  batchId: string;
  perspective: RegressionPerspective;
  title: string;
  subtitle: string;
  metricCard: RegressionMetricCardModel;
  rows: RegressionDiffRow[];
  runAt: string | null;
  runId: string | null;
  datasetName: string | null;
  sampleCount: number | null;
  summary: RegressionSummaryGroups;
}

export interface RegressionOverviewModel {
  verify: RegressionMetricCardModel;
  qc: RegressionMetricCardModel;
  decision: RegressionDecisionModel;
}

export function buildRegressionOverview(detail: unknown, batchId?: string): RegressionOverviewModel {
  const rawDetail = asRecord(detail);
  const overviewRecord = pickRecord(rawDetail, [
    "regressionOverview",
    "regressionSummary",
    "regression",
    "regressionResult",
    "regression_result",
    "regressionMetrics",
  ]);
  const summaryRecord = pickRecord(rawDetail, ["summary"]);
  const headerRecord = pickRecord(rawDetail, ["header"]);
  const verifyRecord = pickRecord(overviewRecord, ["verify"]);
  const qcRecord = pickRecord(overviewRecord, ["qc"]);
  const topLevel = mergeRecords(rawDetail, overviewRecord, summaryRecord, headerRecord);
  const datasetName = pickString(topLevel, ["datasetName", "dataset_name", "dataset", "regressionDatasetName"]);
  const runAt =
    pickString(topLevel, ["runAt", "updatedAt", "updatetime", "timestampSuffix", "executedAt", "createdAt"]) ??
    pickString(overviewRecord, ["latestRunAt"]);
  const runId = pickString(topLevel, ["runId", "timestampSuffix", "run_id"]) ?? pickString(overviewRecord, ["runId"]);
  const sampleCount =
    pickNumber(topLevel, ["sampleCount", "totalCount", "total_count"]) ??
    pickNumber(verifyRecord, ["sampleCount", "totalCount", "total_count"]) ??
    pickNumber(qcRecord, ["sampleCount", "totalCount", "total_count"]);

  const verify = createMetricCard({
    perspective: "verify",
    datasetName: pickString(verifyRecord, ["datasetName", "dataset_name"]) ?? datasetName,
    runAt: pickString(verifyRecord, ["runAt", "updatedAt", "updatetime"]) ?? runAt,
    runId: pickString(verifyRecord, ["runId", "run_id", "timestampSuffix"]) ?? runId,
    sampleCount: pickNumber(verifyRecord, ["sampleCount", "totalCount", "total_count"]) ?? sampleCount,
    betterRatio:
      pickNumber(verifyRecord, ["betterRatio", "verifyBetterRatio", "verify_better_ratio"]) ??
      pickNumber(topLevel, ["verifyBetterRatio", "verify_better_ratio"]),
    worsenRatio:
      pickNumber(verifyRecord, ["worsenRatio", "verifyWorsenRatio", "verify_worsen_ratio"]) ??
      pickNumber(topLevel, ["verifyWorsenRatio", "verify_worsen_ratio"]),
    totalCount: pickNumber(verifyRecord, ["totalCount", "total_count", "sampleCount"]) ?? sampleCount,
    positiveCount: pickNumber(verifyRecord, ["positiveCount", "positive_count", "betterCount"]),
    negativeCount: pickNumber(verifyRecord, ["negativeCount", "negative_count", "worsenCount"]),
  });
  const qc = createMetricCard({
    perspective: "qc",
    datasetName: pickString(qcRecord, ["datasetName", "dataset_name"]) ?? datasetName,
    runAt: pickString(qcRecord, ["runAt", "updatedAt", "updatetime"]) ?? runAt,
    runId: pickString(qcRecord, ["runId", "run_id", "timestampSuffix"]) ?? runId,
    sampleCount: pickNumber(qcRecord, ["sampleCount", "totalCount", "total_count"]) ?? sampleCount,
    betterRatio:
      pickNumber(qcRecord, ["betterRatio", "qcBetterRatio", "qc_better_ratio"]) ??
      pickNumber(topLevel, ["qcBetterRatio", "qc_better_ratio"]),
    worsenRatio:
      pickNumber(qcRecord, ["worsenRatio", "qcWorsenRatio", "qc_worsen_ratio"]) ??
      pickNumber(topLevel, ["qcWorsenRatio", "qc_worsen_ratio"]),
    totalCount: pickNumber(qcRecord, ["totalCount", "total_count", "sampleCount"]) ?? sampleCount,
    positiveCount: pickNumber(qcRecord, ["positiveCount", "positive_count", "betterCount"]),
    negativeCount: pickNumber(qcRecord, ["negativeCount", "negative_count", "worsenCount"]),
  });

  const decision = createDecisionModel(rawDetail, verify, qc, batchId);
  return { verify, qc, decision };
}

export function buildRegressionDetailModel(
  detail: HitlRegressionDetailResponse | null | undefined,
  perspective: RegressionPerspective,
  batchId?: string,
): RegressionDetailPageModel {
  const header = detail?.header;
  const summary = detail?.summary;
  const fallbackBatchId = header?.batchId ?? batchId ?? "";
  const metricCard = createMetricCard({
    perspective,
    datasetName: header?.datasetName ?? null,
    runAt: header?.runAt ?? null,
    runId: header?.runId ?? null,
    sampleCount: header?.totalCount ?? summary?.totalCount ?? null,
    betterRatio: summary?.betterRatio ?? null,
    worsenRatio: summary?.worsenRatio ?? null,
    totalCount: summary?.totalCount ?? header?.totalCount ?? null,
    positiveCount: summary?.positiveCount ?? null,
    negativeCount: summary?.negativeCount ?? null,
  });
  const rows: RegressionDiffRow[] = (detail?.rows ?? []).map((row) => ({
    id: row.sampleId,
    sampleId: row.sampleId,
    taskId: row.taskId,
    sampleType: row.sampleType,
    poiName: row.poiName,
    isConsistent: row.isConsistent,
    diffDirection: row.diffDirection,
    primaryOldValue: row.primaryOldValue,
    primaryNewValue: row.primaryNewValue,
    secondaryDiffText: row.secondaryDiffText,
    detailPreview: row.detailPreview,
    sampleDetailUrl: row.sampleDetailUrl,
    raw: row as unknown as Record<string, unknown>,
  }));

  return {
    batchId: fallbackBatchId,
    perspective,
    title: perspective === "verify" ? "核实回归详情" : "质检回归详情",
    subtitle: perspective === "verify" ? "关注核实结果的新旧差异" : "关注质检结果的新旧差异",
    metricCard,
    rows,
    runAt: header?.runAt ?? null,
    runId: header?.runId ?? null,
    datasetName: header?.datasetName ?? null,
    sampleCount: header?.totalCount ?? summary?.totalCount ?? null,
    summary: toRegressionSummaryGroups(summary),
  };
}

export function formatRatio(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

export function formatCount(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return String(value);
}

export function getDecisionTone(status: RegressionDecisionModel["status"]): {
  pillClass: string;
  panelClass: string;
  accentClass: string;
} {
  if (status === "launch") {
    return {
      pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      panelClass: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50",
      accentClass: "text-emerald-700",
    };
  }
  if (status === "rollback") {
    return {
      pillClass: "border-rose-200 bg-rose-50 text-rose-700",
      panelClass: "border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50",
      accentClass: "text-rose-700",
    };
  }
  return {
    pillClass: "border-amber-200 bg-amber-50 text-amber-700",
    panelClass: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50",
    accentClass: "text-amber-700",
  };
}

function createMetricCard(input: {
  perspective: RegressionPerspective;
  datasetName: string | null;
  runAt: string | null;
  runId: string | null;
  sampleCount: number | null;
  betterRatio: number | null;
  worsenRatio: number | null;
  totalCount: number | null;
  positiveCount: number | null;
  negativeCount: number | null;
}): RegressionMetricCardModel {
  const statusText = deriveMetricStatus(input.betterRatio, input.worsenRatio);
  const headline =
    statusText === "建议回滚"
      ? `${input.perspective === "verify" ? "核实" : "质检"}回归出现明显变差`
      : statusText === "建议上线"
        ? `${input.perspective === "verify" ? "核实" : "质检"}回归整体稳定`
        : `${input.perspective === "verify" ? "核实" : "质检"}回归需人工确认`;
  const summary = [
    input.perspective === "verify"
      ? input.worsenRatio != null
        ? `核实逆向率 ${formatRatio(input.worsenRatio)}`
        : null
      : input.worsenRatio != null
        ? `质检逆向率 ${formatRatio(input.worsenRatio)}`
        : null,
    input.perspective === "verify"
      ? input.betterRatio != null
        ? `核实提升率 ${formatRatio(input.betterRatio)}`
        : null
      : input.betterRatio != null
        ? `质检提升率 ${formatRatio(input.betterRatio)}`
        : null,
  ]
    .filter(Boolean)
    .join("，") || "当前批次暂无可展示的回归指标";

  return {
    perspective: input.perspective,
    title: input.perspective === "verify" ? "核实回归" : "质检回归",
    subtitle: input.perspective === "verify" ? "聚焦核实结果是否变好 / 变差" : "聚焦质检结果是否变好 / 变差",
    betterRatio: input.betterRatio,
    worsenRatio: input.worsenRatio,
    totalCount: input.totalCount,
    positiveCount: input.positiveCount,
    negativeCount: input.negativeCount,
    datasetName: input.datasetName,
    runAt: input.runAt,
    runId: input.runId,
    sampleCount: input.sampleCount,
    statusText,
    headline,
    summary,
  };
}

function toRegressionSummaryGroups(summary: HitlRegressionSummary | null | undefined): RegressionSummaryGroups {
  return {
    metrics: {
      worsenRatio: summary?.worsenRatio ?? null,
      betterRatio: summary?.betterRatio ?? null,
    },
    sampleComposition: {
      totalCount: summary?.totalCount ?? 0,
      positiveCount: summary?.positiveCount ?? 0,
      negativeCount: summary?.negativeCount ?? 0,
    },
    detailStats: {
      worsenCount: summary?.worsenCount ?? 0,
      betterCount: summary?.betterCount ?? 0,
      sameCount: summary?.sameCount ?? 0,
      unknownCount: summary?.unknownCount ?? 0,
    },
  };
}

function deriveMetricStatus(betterRatio: number | null, worsenRatio: number | null): string {
  if (worsenRatio != null && worsenRatio > 0.05) return "建议回滚";
  if ((worsenRatio ?? 0) === 0 && betterRatio != null && betterRatio > 0) return "建议上线";
  if ((worsenRatio ?? 0) === 0 && betterRatio != null && betterRatio === 0) return "建议人工复核";
  return "建议人工复核";
}

function createDecisionModel(
  rawDetail: GenericRecord | null,
  verify: RegressionMetricCardModel,
  qc: RegressionMetricCardModel,
  batchId?: string,
): RegressionDecisionModel {
  const decisionRecord = pickRecord(rawDetail, ["decisionOverview", "decision", "finalConclusion", "conclusion"]);
  const explicitStatus = pickString(decisionRecord, ["status", "decision", "decisionStatus"]);
  const explicitTitle = pickString(decisionRecord, ["title", "label", "decisionLabel"]);
  const summary =
    pickString(decisionRecord, ["summary", "description", "reasonSummary"]) ?? deriveDecisionSummary(verify, qc, batchId);
  const explicitReasons = [
    ...pickStringArray(decisionRecord, ["reasons", "actions", "reasonList"]),
    ...pickReasonItems(decisionRecord),
  ].filter(Boolean);

  const inferredStatus = mapDecisionStatus(explicitStatus) ?? inferDecisionStatus(verify, qc);
  const title = explicitTitle ?? getDecisionTitle(inferredStatus);
  const reasons = explicitReasons.length > 0 ? explicitReasons : deriveDecisionReasons(verify, qc);

  return {
    status: inferredStatus,
    title,
    summary,
    reasons,
    confidenceLabel: inferredStatus === "review" ? "建议复核后决策" : "发布信号清晰",
  };
}

function pickReasonItems(record: GenericRecord | null): string[] {
  const items = record?.reasonItems;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const text = pickString(item as GenericRecord, ["description", "title"]);
      return text ?? null;
    })
    .filter((item): item is string => Boolean(item));
}

function deriveDecisionSummary(
  verify: RegressionMetricCardModel,
  qc: RegressionMetricCardModel,
  batchId?: string,
): string {
  const batchText = batchId ? `批次 ${batchId}` : "当前批次";
  if (inferDecisionStatus(verify, qc) === "rollback") {
    return `${batchText} 在回归中出现关键指标变差，建议优先回滚并定位原因。`;
  }
  if (inferDecisionStatus(verify, qc) === "launch") {
    return `${batchText} 的核实与质检回归保持稳定，可作为上线候选。`;
  }
  return `${batchText} 的回归信号存在不确定性，建议人工复核后再决定上线或回滚。`;
}

function deriveDecisionReasons(verify: RegressionMetricCardModel, qc: RegressionMetricCardModel): string[] {
  const reasons = [
    summarizeMetricReason(verify, "核实"),
    summarizeMetricReason(qc, "质检"),
  ].filter(Boolean) as string[];
  return reasons.length > 0 ? reasons : ["当前批次暂无显著风险或收益信号，建议结合样本明细继续判断"];
}

function summarizeMetricReason(card: RegressionMetricCardModel, label: string): string | null {
  if (card.worsenRatio != null && card.worsenRatio > 0) {
    return `${label}回归中有 ${formatRatio(card.worsenRatio)} 的样本出现变差。`;
  }
  if (card.betterRatio != null && card.betterRatio > 0) {
    return `${label}回归中有 ${formatRatio(card.betterRatio)} 的样本表现变好，且未发现明显变差。`;
  }
  if (card.totalCount != null) {
    return `${label}回归已覆盖 ${card.totalCount} 个样本，当前未识别到明确收益或风险。`;
  }
  return null;
}

function inferDecisionStatus(
  verify: RegressionMetricCardModel,
  qc: RegressionMetricCardModel,
): RegressionDecisionModel["status"] {
  if ((verify.worsenRatio ?? 0) > 0.05 || (qc.worsenRatio ?? 0) > 0.05) return "rollback";
  if ((verify.worsenRatio ?? 0) === 0 && (qc.worsenRatio ?? 0) === 0 && ((verify.betterRatio ?? 0) > 0 || (qc.betterRatio ?? 0) > 0)) {
    return "launch";
  }
  return "review";
}

function getDecisionTitle(status: RegressionDecisionModel["status"]): string {
  if (status === "launch") return "建议上线";
  if (status === "rollback") return "建议回滚";
  return "建议人工复核";
}

function mapDecisionStatus(value: string | null): RegressionDecisionModel["status"] | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("launch") || normalized.includes("上线")) return "launch";
  if (normalized.includes("rollback") || normalized.includes("回滚")) return "rollback";
  if (normalized.includes("review") || normalized.includes("复核")) return "review";
  return null;
}

function mergeRecords(...records: Array<GenericRecord | null>): GenericRecord {
  return Object.assign({}, ...records.filter(Boolean));
}

function asRecord(value: unknown): GenericRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GenericRecord;
}

function pickRecord(source: GenericRecord | null, keys: string[]): GenericRecord | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function pickString(source: GenericRecord | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return null;
}

function pickNumber(source: GenericRecord | null, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function pickStringArray(source: GenericRecord | null, keys: string[]): string[] {
  if (!source) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    }
  }
  return [];
}
