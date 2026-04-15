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

export type HITLSkillType = "verify" | "qc";
export type HITLIterationBatchStatus =
  | "analysis_in_progress"
  | "suggestions_ready"
  | "candidate_versions_ready"
  | "joint_regression_running"
  | "decision_completed";
export type HITLIssueSeverity = "low" | "medium" | "high" | "critical";
export type HITLReleaseDecision = "go_live" | "conditional_go_live" | "hold" | "rollback" | "keep_baseline";

export interface HITLTaskExecutionBatchRef {
  batchId: string;
  taskCount: number;
  coveredFrom: string;
  coveredTo: string;
}

export interface HITLManualFeedbackPool {
  poolId: string;
  poolName: string;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
  issueTypeSummary: Array<{ issueType: string; count: number }>;
  sourceTaskExecutionBatches: HITLTaskExecutionBatchRef[];
}

export interface HITLIterationBatchOverview {
  iterationBatchId: string;
  title: string;
  goal: string;
  startedAt: string;
  endedAt: string | null;
  sampleCount: number;
  status: HITLIterationBatchStatus;
  feedbackPoolId: string;
}

export interface HITLSkillIssueAnalysis {
  issueId: string;
  skillType: HITLSkillType;
  category: string;
  severity: HITLIssueSeverity;
  frequency: number;
  rootCauseSummary: string;
  evidenceSummary: string;
  relatedTaskIds: string[];
}

export interface HITLSkillIterationSuggestion {
  suggestionId: string;
  skillType: HITLSkillType;
  issueId: string;
  problemSummary: string;
  changeSummary: string;
  expectedBenefit: string;
  riskSummary: string;
  includedInCandidate: boolean;
}

export interface HITLSkillCandidateVersion {
  skillType: HITLSkillType;
  baselineVersion: string;
  candidateVersion: string;
  capabilityChangeSummary: string;
  generatedAt: string;
}

export interface HITLRegressionMetric {
  name: string;
  baselineValue: number | null;
  candidateValue: number | null;
  delta: number | null;
  unit: string;
}

export interface HITLSkillRegressionResult {
  skillType: HITLSkillType;
  passed: boolean;
  summary: string;
  sampleCount: number;
  metrics: HITLRegressionMetric[];
}

export interface HITLJointRegressionResult {
  regressionRunId: string;
  status: "pending" | "running" | "completed";
  sampleCount: number;
  coverageSummary: string;
  verifyResult: HITLSkillRegressionResult;
  qcResult: HITLSkillRegressionResult;
}

export interface HITLReleaseConclusion {
  decision: HITLReleaseDecision;
  decidedAt: string;
  decisionOwner: string;
  rationaleSummary: string;
  verifyPassed: boolean;
  qcPassed: boolean;
}

export interface HITLIterationDetail {
  overview: HITLIterationBatchOverview;
  manualFeedbackPool: HITLManualFeedbackPool;
  verifyIssues: HITLSkillIssueAnalysis[];
  qcIssues: HITLSkillIssueAnalysis[];
  verifySuggestions: HITLSkillIterationSuggestion[];
  qcSuggestions: HITLSkillIterationSuggestion[];
  verifyCandidateVersion: HITLSkillCandidateVersion;
  qcCandidateVersion: HITLSkillCandidateVersion;
  jointRegression: HITLJointRegressionResult;
  releaseConclusion: HITLReleaseConclusion;
}

export type HITLIterationSection =
  | "overview"
  | "analysis"
  | "suggestions"
  | "candidate_versions"
  | "joint_regression"
  | "release_conclusion";

export interface HITLIterationPageState {
  loading: boolean;
  error: string;
  selectedIterationBatchId: string | null;
  selectedSkillView: HITLSkillType | "all";
  activeSection: HITLIterationSection;
  data: HITLIterationDetail | null;
}
