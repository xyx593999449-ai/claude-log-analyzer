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

export interface HitlRegressionMetric {
  label: string;
  baseline: string;
  candidate: string;
  delta: string;
}

export interface HitlRegressionResult {
  skillType: string;
  passed: boolean;
  summary: string;
  metrics: HitlRegressionMetric[];
}

export interface HitlFinalConclusion {
  title: string;
  summary: string;
  actions: string[];
}

export interface HitlIterationDetail {
  overview: HitlIterationListItem;
  flow: HitlFlowStep[];
  rootCauses: HitlRootCauseItem[];
  prompts: HitlPromptItem[];
  modifications: HitlModificationItem[];
  overlayInsight: HitlOverlayInsight;
  regressionResults?: HitlRegressionResult[];
  conclusion?: HitlFinalConclusion;
}

export interface HitlIssueTaskListItem {
  taskId: string;
  name: string | null;
  address: string | null;
  city: string | null;
  poiType: string | null;
  verifyResult: string | null;
  qualityStatus: string | null;
  issueObservationTags: string[];
  judgmentDimensionTags: string[];
  manualComment: string | null;
}

export interface HitlIssueTaskDetail {
  task: Record<string, unknown>;
  verifyResult: Record<string, unknown>;
  qcResult: Record<string, unknown>;
  manualResult: Record<string, unknown>;
  modelAnalysis: Record<string, unknown>;
}
