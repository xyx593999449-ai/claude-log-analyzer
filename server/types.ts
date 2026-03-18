export type AnalysisPhase = "verify" | "qc";

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
  manualOnly: boolean;
  anomalyOnly: boolean;
}

export interface ImportSnapshot {
  importedAt: string;
  source: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}
