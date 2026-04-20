export interface Metrics {
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

export interface ImportSnapshot {
  importedAt: string;
  source: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}

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

export type DashboardTimeGranularity = "hour" | "five_hour" | "day";

export interface RunView {
  phase: "verify" | "qc";
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

export interface TaskListResult {
  total: number;
  page: number;
  pageSize: number;
  items: DashboardTaskItem[];
}

export interface FilterOptions {
  verifyStatuses: string[];
  qcStatuses: string[];
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

export interface ImportResult {
  batchId: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}

export interface BatchOverviewItem {
  batchId: string;
  taskCount: number;
  manualTaskCount: number;
  anomalyCount: number;
  qcRejectedCount: number;
  totalDurationMs: number;
  automationRate: number;
  qcPassRate: number;
  createdAt: string | null;
  completedAt: string | null;
  totalTokens: number;
  status: "pending" | "running" | "completed";
}

export type HitlFlowStepId = "feedback" | "analysis" | "iteration" | "candidate" | "regression" | "decision";
export type HitlFlowStepStatus = "completed" | "active" | "pending" | "unavailable";

export interface HitlIterationListItem {
  batchId: string;
  startedAt: string | null;
  sampleCount: number;
  issueCount: number;
  summary: string | null;
  status: string | null;
}

export interface HitlBatchImportErrorDetail {
  rowNumber?: number;
  field?: string | null;
  message: string;
}

export interface HitlBatchImportPreviewRow {
  rowNumber: number;
  values: Record<string, string | null>;
}

export interface HitlBatchImportPreviewResponse {
  batchId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  columns: string[];
  previewRows: HitlBatchImportPreviewRow[];
  previewToken: string;
}

export interface HitlBatchImportCommitResult {
  batchId: string;
  insertedCount: number;
  createdAt: string;
}

export interface HitlFlowStep {
  id: HitlFlowStepId;
  label: string;
  summary: string;
  status: HitlFlowStepStatus;
}

export interface HitlRootCauseItem {
  issueType: string;
  issueTypeLabel: string;
  count: number;
  skillType: string;
  skillTypeLabel: string;
  summary: string | null;
  detailUrl: string;
}

export interface HitlPromptItem {
  skillKey: string;
  skillLabel: string;
  promptFileName: string;
  promptPath: string | null;
  content: string;
}

export interface HitlModificationItem {
  targetSkill: string;
  targetSkillLabel: string;
  changeSummary: string | null;
  modifiedFiles: string[];
  status: string | null;
  createdAt: string | null;
}

export interface HitlOverlayPatternItem {
  issueType: string;
  issueTypeLabel: string;
  pattern: string;
  count: number;
}

export interface HitlOverlaySkillImpactItem {
  skillType: string;
  skillTypeLabel: string;
  impactSummary: string;
}

export interface HitlOverlayInsight {
  rootCauseAnalysis: string | null;
  learnablePatterns: HitlOverlayPatternItem[];
  skillImpact: HitlOverlaySkillImpactItem[];
}

export type HitlRegressionType = "verify" | "qc";
export type HitlDecision = "launch" | "rollback" | "review";
export type HitlDecisionReasonSeverity = "high" | "medium" | "low";
export type HitlRegressionDiffDirection = "better" | "worsen" | "same" | "unknown";

export interface HitlRegressionSummaryCard {
  regressionType: HitlRegressionType;
  title: string;
  batchId: string;
  datasetName: string | null;
  runAt: string | null;
  runId: string | null;
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  betterRatio: number | null;
  worsenRatio: number | null;
  detailUrl: string;
}

export interface HitlIterationRegressionOverview {
  batchId: string;
  latestRunAt: string | null;
  datasetName: string | null;
  runId: string | null;
  verify: HitlRegressionSummaryCard | null;
  qc: HitlRegressionSummaryCard | null;
}

export interface HitlRegressionRunItem {
  batchId: string;
  datasetName: string | null;
  runAt: string | null;
  runId: string | null;
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  verifyBetterRatio: number | null;
  verifyWorsenRatio: number | null;
  qcBetterRatio: number | null;
  qcWorsenRatio: number | null;
}

export interface HitlDecisionReasonItem {
  type: string;
  title: string;
  description: string;
  severity: HitlDecisionReasonSeverity;
  metricValue: number | null;
}

export interface HitlIterationDecisionOverview {
  decision: HitlDecision;
  decisionLabel: string;
  reasonSummary: string | null;
  runAt: string | null;
  datasetName: string | null;
  runId: string | null;
  verifyBetterRatio: number | null;
  verifyWorsenRatio: number | null;
  qcBetterRatio: number | null;
  qcWorsenRatio: number | null;
  reasonItems: HitlDecisionReasonItem[];
}

export interface HitlRegressionFieldDiff {
  label: string;
  oldValue: string | null;
  newValue: string | null;
  diffText: string | null;
}

export interface HitlRegressionHeader {
  batchId: string;
  regressionType: HitlRegressionType;
  regressionTypeLabel: string;
  datasetName: string | null;
  runAt: string | null;
  runId: string | null;
  totalCount: number;
}

export interface HitlRegressionSummary {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  betterRatio: number | null;
  worsenRatio: number | null;
  changedCount: number;
  betterCount: number;
  worsenCount: number;
  sameCount: number;
  unknownCount: number;
}

export interface HitlRegressionDiffRow {
  sampleId: string;
  taskId: string | null;
  poiName: string | null;
  sampleType: string | null;
  isConsistent: boolean | null;
  diffDirection: HitlRegressionDiffDirection;
  primaryOldValue: string | null;
  primaryNewValue: string | null;
  primaryDiffText: string | null;
  secondaryOldValue: string | null;
  secondaryNewValue: string | null;
  secondaryDiffText: string | null;
  detailPreview: string | null;
  sampleDetailUrl: string;
}

export interface HitlRegressionDetailResponse {
  header: HitlRegressionHeader;
  summary: HitlRegressionSummary;
  rows: HitlRegressionDiffRow[];
}

export interface HitlRegressionSampleDetail {
  header: {
    batchId: string;
    regressionType: HitlRegressionType;
    regressionTypeLabel: string;
    datasetName: string | null;
    runAt: string | null;
    runId: string | null;
    sampleId: string;
    taskId: string | null;
    sampleType: string | null;
    isConsistent: boolean | null;
  };
  baseInfo: {
    poiName: string | null;
    address: string | null;
    city: string | null;
    poiType: string | null;
    status: string | null;
  };
  resultDiffs: {
    primary: HitlRegressionFieldDiff;
    secondary: HitlRegressionFieldDiff;
  };
  fieldDiffs: HitlRegressionFieldDiff[];
  truthInfo: {
    name: string | null;
    address: string | null;
    city: string | null;
    poiType: string | null;
    cityAdcode: string | null;
    status: string | null;
  };
  currentInfo: {
    verifyResult: string | null;
    qcStatus: string | null;
  };
  verifiedInfo: {
    name: string | null;
    address: string | null;
    city: string | null;
    poiType: string | null;
    cityAdcode: string | null;
    status: string | null;
    verifyResult: string | null;
  };
  verifyInfo: unknown;
  evidenceRecord: unknown;
}

export interface HitlIterationDetail {
  overview: HitlIterationListItem;
  flow: HitlFlowStep[];
  rootCauses: HitlRootCauseItem[];
  prompts: HitlPromptItem[];
  modifications: HitlModificationItem[];
  overlayInsight: HitlOverlayInsight;
  regressionOverview: HitlIterationRegressionOverview | null;
  decisionOverview: HitlIterationDecisionOverview | null;
}

export interface HitlIssueTaskListItem {
  taskId: string;
  name: string | null;
  address: string | null;
  city: string | null;
  poiType: string | null;
  verifyResult: string | null;
  qualityStatus?: string | null;
  qcStatus?: string | null;
  issueObservationTags: string[];
  judgmentDimensionTags: string[];
  manualComment: string | null;
}

export interface HitlIssueTaskDetail {
  task: {
    taskId: string;
    batchId: string;
    id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    poiType: string | null;
    updatetime: string | null;
    qcTime?: string | null;
  };
  verifyResult: {
    verifyResult: string | null;
    verifyInfo: unknown;
    evidenceRecord: unknown;
  };
  qcResult: {
    qualityStatus?: string | null;
    qcStatus: string | null;
    qcScore: number | null;
    qcResult: unknown;
    isQualified: boolean | null;
    hasRisk: boolean | null;
    isManualRequired?: boolean | null;
  };
  manualResult: {
    verifyContentIsCorrect: boolean | null;
    verifyActionIsCorrect: boolean | null;
    qcInterceptIsCorrect: boolean | null;
    evidenceStatus: string | null;
    issueObservationTags: string[];
    judgmentDimensionTags: string[];
    manualComment: string | null;
    conflictingEvidence: string | null;
    manualAddedEvidenceUrl: string | null;
    manualAddedEvidenceType: string | null;
    manualAddedEvidenceAbstract: string | null;
    verifiedName: string | null;
    verifiedAddr: string | null;
    verifiedAddress?: string | null;
    verifiedPoiType: string | null;
    verifiedCityAdcode: string | null;
  };
  modelAnalysis: {
    issueType: string;
    issueTypeLabel: string;
    skillType: string | null;
    skillTypeLabel: string | null;
    summary: string | null;
    rootCause: string | null;
    prompts: Array<{
      skillKey: string;
      skillLabel: string;
      promptFileName: string;
      promptPath: string | null;
      content: string;
    }>;
  };
}
