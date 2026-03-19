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
}

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
}

export interface ImportResult {
  batchId: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}
