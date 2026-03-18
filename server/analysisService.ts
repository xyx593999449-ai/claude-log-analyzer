import type { AggregatedTaskRun, AnalysisPhase, BatchTaskRecord, ClaudeTaskRecord, ImportedLogBundle } from "./types";
import { parseBatchExecutorLog } from "./parsers/batchExecutor";
import { parseClaudeTaskLog } from "./parsers/claudeTask";
import type { DashboardRepositoryPort, ImportPayload } from "./repository";

interface ImportResult {
  batchId: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}

const GLM_INPUT_PRICE_PER_MILLION = 4;
const GLM_OUTPUT_PRICE_PER_MILLION = 18;

function normalizeLogContent(raw: string): string {
  // Remove UTF-8 BOM and accidental NULs before parsing.
  return raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseLogTime(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T").replace(",", ".");
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts;
}

function pickMinTime(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function pickMaxTime(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function durationFromTimes(startedAt: string | null, endedAt: string | null): number {
  const start = parseLogTime(startedAt);
  const end = parseLogTime(endedAt);
  if (start == null || end == null || end < start) return 0;
  return end - start;
}

function normalizeStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (["success", "succeeded", "done", "ok", "completed", "processed"].some((k) => normalized.includes(k))) {
    return "success";
  }
  if (["fail", "failed", "error", "timeout", "skipped", "skip"].some((k) => normalized.includes(k))) {
    return "failed";
  }
  return normalized;
}

function calcGlmCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * GLM_INPUT_PRICE_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * GLM_OUTPUT_PRICE_PER_MILLION;
  return inputCost + outputCost;
}

function buildAggregatedRows(
  phase: AnalysisPhase,
  batchRows: BatchTaskRecord[],
  claudeRows: ClaudeTaskRecord[],
): AggregatedTaskRun[] {
  const byTask = new Map<string, { batch: BatchTaskRecord | null; claude: ClaudeTaskRecord | null }>();

  for (const row of batchRows) {
    byTask.set(row.taskId, { batch: row, claude: byTask.get(row.taskId)?.claude ?? null });
  }

  for (const row of claudeRows) {
    byTask.set(row.taskId, { batch: byTask.get(row.taskId)?.batch ?? null, claude: row });
  }

  const rows: AggregatedTaskRun[] = [];

  for (const [taskId, pair] of byTask.entries()) {
    const batch = pair.batch;
    const claude = pair.claude;

    const sessionIds = [...new Set(claude?.sessionIds ?? [])];
    const startedAt = pickMinTime(batch?.startedAt ?? null, claude?.startedAt ?? null);
    const endedAt = pickMaxTime(batch?.endedAt ?? null, claude?.endedAt ?? null);
    const durationMs =
      safeNumber(batch?.durationMs) || durationFromTimes(startedAt, endedAt) || safeNumber(claude?.totalDurationMs);

    const baseStatus = normalizeStatus(batch?.status ?? null);
    const fallbackStatus = claude && (claude.totalToolErrors > 0 || claude.errorSummary) ? "failed" : "success";

    const totalInputTokens = safeNumber(claude?.totalInputTokens);
    const totalOutputTokens = safeNumber(claude?.totalOutputTokens);
    const totalCost = calcGlmCost(totalInputTokens, totalOutputTokens);

    rows.push({
      phase,
      taskId,
      rowNumber: batch?.rowNumber ?? null,
      workerId: batch?.workerId ?? claude?.workerId ?? null,
      batchId: batch?.batchId ?? claude?.batchId ?? null,
      taskName: batch?.taskName ?? claude?.taskName ?? null,
      poiId: batch?.poiId ?? claude?.poiId ?? null,
      city: batch?.city ?? claude?.city ?? null,
      status: baseStatus ?? (claude ? fallbackStatus : null),
      startedAt,
      endedAt,
      durationMs,
      attemptCount: Math.max(safeNumber(batch?.attemptCount), claude ? 1 : 0),
      retryCount: Math.max(safeNumber(batch?.retryCount), safeNumber(batch?.attemptCount) - 1, 0),
      sessionCount: claude?.sessionCount ?? sessionIds.length,
      sessionIds,
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens: safeNumber(claude?.totalCacheTokens),
      totalCostUsd: totalCost,
      totalModelDurationMs: safeNumber(claude?.totalDurationMs),
      totalToolCalls: safeNumber(claude?.totalToolCalls),
      totalToolErrors: safeNumber(claude?.totalToolErrors),
      errorSummary: batch?.errorSummary ?? claude?.errorSummary ?? null,
      rawDetails: {
        batch: batch ?? null,
        claude: claude ?? null,
      },
    });
  }

  return rows;
}

function parsePhase(bundle: ImportedLogBundle, phase: AnalysisPhase): AggregatedTaskRun[] {
  const logs = phase === "verify"
    ? [bundle.verifyExecutorLog, bundle.verifyClaudeLog]
    : [bundle.qcExecutorLog, bundle.qcClaudeLog];

  let bestBatchRows: BatchTaskRecord[] = [];
  let bestClaudeRows: ClaudeTaskRecord[] = [];

  for (const raw of logs) {
    if (!raw || !raw.trim()) continue;
    const content = normalizeLogContent(raw);

    try {
      const parsedBatch = parseBatchExecutorLog(content, phase);
      if (parsedBatch.length > bestBatchRows.length) bestBatchRows = parsedBatch;
    } catch {
      // ignore and try next parser/file
    }

    try {
      const parsedClaude = parseClaudeTaskLog(content, phase);
      if (parsedClaude.length > bestClaudeRows.length) bestClaudeRows = parsedClaude;
    } catch {
      // ignore and try next parser/file
    }
  }

  return buildAggregatedRows(phase, bestBatchRows, bestClaudeRows);
}

export class AnalysisService {
  constructor(private readonly repository: DashboardRepositoryPort) {}

  async importLogs(payload: ImportPayload): Promise<ImportResult> {
    const verifyRows = parsePhase(payload, "verify");
    const qcRows = parsePhase(payload, "qc");
    const allRows = [...verifyRows, ...qcRows];

    const batchId = this.repository.nextImportBatchId();
    if (allRows.length > 0) {
      await this.repository.insertAggregatedRuns(batchId, allRows);
    }

    await this.repository.insertImport(payload, batchId, verifyRows.length, qcRows.length, allRows.length);

    return {
      batchId,
      verifyTaskCount: verifyRows.length,
      qcTaskCount: qcRows.length,
      totalTaskRuns: allRows.length,
    };
  }
}
