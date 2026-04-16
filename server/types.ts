export type AnalysisPhase = "verify" | "qc";
export type DashboardTimeGranularity = "hour" | "five_hour" | "day";

export interface SampleSeedRecord {
  record_no?: number;
  poi_init: Record<string, unknown>;
  poi_verified?: Record<string, unknown> | null;
  poi_qc?: Record<string, unknown> | null;
}

export interface ImportedLogBundle {
  verifyExecutorLog?: string;
  verifyClaudeLog?: string;
  qcExecutorLog?: string;
  qcClaudeLog?: string;
}

export interface BatchTaskRecord {
  phase: AnalysisPhase;
  taskId: string;
  rowNumber: number | null;
  workerId: string | null;
  batchId: string | null;
  taskName: string | null;
  poiId: string | null;
  city: string | null;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  attemptCount: number;
  retryCount: number;
  errorSummary: string | null;
  detailNotes: string[];
}

export interface ClaudeTaskRecord {
  phase: AnalysisPhase;
  taskId: string;
  workerId: string | null;
  batchId: string | null;
  taskName: string | null;
  poiId: string | null;
  city: string | null;
  sessionIds: string[];
  startedAt: string | null;
  endedAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalToolCalls: number;
  totalToolErrors: number;
  sessionCount: number;
  errorSummary: string | null;
}

export interface AggregatedTaskRun {
  phase: AnalysisPhase;
  taskId: string;
  rowNumber: number | null;
  workerId: string | null;
  batchId: string | null;
  taskName: string | null;
  poiId: string | null;
  city: string | null;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  attemptCount: number;
  retryCount: number;
  sessionCount: number;
  sessionIds: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCostUsd: number;
  totalModelDurationMs: number;
  totalToolCalls: number;
  totalToolErrors: number;
  errorSummary: string | null;
  rawDetails: {
    batch: BatchTaskRecord | null;
    claude: ClaudeTaskRecord | null;
  };
}

export interface DashboardFilters {
  page: number;
  pageSize: number;
  search: string;
  verifyStatus: string;
  qcStatus: string;
  alertTags: string[];
  manualOnly: boolean;
  anomalyOnly: boolean;
  batches?: string[];
  /** 时间段筛选 - 开始时间（ISO 格式或 YYYY-MM-DD），用于按执行日志时间过滤 */
  startTime?: string;
  /** 时间段筛选 - 结束时间（ISO 格式或 YYYY-MM-DD），用于按执行日志时间过滤 */
  endTime?: string;
  /** 趋势图粒度 */
  timeGranularity?: DashboardTimeGranularity;
}

export interface ImportSnapshot {
  importedAt: string;
  source: string;
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
  status: "analysis" | "iteration" | "regression";
}

export interface HitlFlowStep {
  id: HitlFlowStepId;
  label: string;
  status: HitlFlowStepStatus;
  summary: string;
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

export interface HitlIterationDetail {
  overview: HitlIterationListItem;
  flow: HitlFlowStep[];
  rootCauses: HitlRootCauseItem[];
  prompts: HitlPromptItem[];
  modifications: HitlModificationItem[];
  overlayInsight: HitlOverlayInsight;
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
  updatetime: string | null;
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
    qcTime: string | null;
  };
  verifyResult: {
    verifyResult: string | null;
    verifyInfo: Record<string, unknown> | null;
    evidenceRecord: unknown;
  };
  qcResult: {
    qualityStatus: string | null;
    qcStatus: string | null;
    qcScore: number | null;
    qcResult: Record<string, unknown> | null;
    isQualified: boolean | null;
    hasRisk: boolean | null;
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
    verifiedPoiType: string | null;
    verifiedCityAdcode: string | null;
  };
  modelAnalysis: {
    issueType: string;
    issueTypeLabel: string;
    skillType: string | null;
    skillTypeLabel: string | null;
    summary: string | null;
    rootCause: Record<string, unknown> | null;
    prompts: HitlPromptItem[];
  };
}
