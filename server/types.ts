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
