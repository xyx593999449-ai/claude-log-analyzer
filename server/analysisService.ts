import fs from "node:fs/promises";
import type { AggregatedTaskRun, AnalysisPhase, BatchTaskRecord, ClaudeTaskRecord, ImportedLogBundle } from "./types";
import { parseBatchExecutorLog } from "./parsers/batchExecutor";
import { parseBatchExecutorLogFile } from "./parsers/batchExecutorStream";
import { parseClaudeTaskLog } from "./parsers/claudeTask";
import { parseClaudeTaskLogFile } from "./parsers/claudeTaskStream";
import type { DashboardRepositoryPort, ImportPayload } from "./repository";

interface ImportResult {
  batchId: string;
  verifyTaskCount: number;
  qcTaskCount: number;
  totalTaskRuns: number;
}

export type UploadLogRole = "executor" | "claude" | "unknown";

export interface ImportFileItem {
  phase: AnalysisPhase;
  role: UploadLogRole;
  originalName: string;
  filePath: string;
}

export interface ImportFilesPayload {
  source: string;
  files: ImportFileItem[];
}

const GLM_INPUT_PRICE_PER_MILLION = 4;
const GLM_OUTPUT_PRICE_PER_MILLION = 18;
const MAX_SNIFF_BYTES = 64 * 1024;

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

function inferRoleByName(name: string): UploadLogRole {
  const lower = name.toLowerCase();
  if (/(claude|assistant|session|ndjson|trace)/.test(lower)) return "claude";
  if (/(executor|batch|worker|execute|task|result|verify|qc|run_test)/.test(lower)) return "executor";
  return "unknown";
}

function inferRoleByContentSnippet(content: string): UploadLogRole {
  const normalized = content.replace(/^\uFEFF/, "").slice(0, MAX_SNIFF_BYTES);
  const claudeSignals =
    normalized.includes('"session_id"') &&
    (
      normalized.includes('"type":"message"')
      || normalized.includes('"type":"content_block_start"')
      || normalized.includes('"type":"stream_event"')
    );
  if (claudeSignals) return "claude";

  const executorSignals =
    normalized.includes("task_id")
    && (normalized.includes("Worker ID:") || normalized.includes(">>> [") || normalized.includes("batch_id"));
  if (executorSignals) return "executor";

  return "unknown";
}

async function inferRoleByFileHead(filePath: string): Promise<UploadLogRole> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead <= 0) return "unknown";
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return inferRoleByContentSnippet(text);
  } finally {
    await handle.close();
  }
}

async function resolveRole(item: ImportFileItem): Promise<UploadLogRole> {
  if (item.role !== "unknown") return item.role;
  const byName = inferRoleByName(item.originalName);
  if (byName !== "unknown") return byName;
  return inferRoleByFileHead(item.filePath);
}

function mergeBatchRows(left: BatchTaskRecord, right: BatchTaskRecord): BatchTaskRecord {
  const startedAt = pickMinTime(left.startedAt, right.startedAt);
  const endedAt = pickMaxTime(left.endedAt, right.endedAt);
  return {
    phase: left.phase,
    taskId: left.taskId,
    rowNumber: left.rowNumber ?? right.rowNumber,
    workerId: left.workerId ?? right.workerId,
    batchId: left.batchId ?? right.batchId,
    taskName: left.taskName ?? right.taskName,
    poiId: left.poiId ?? right.poiId,
    city: left.city ?? right.city,
    status: right.status ?? left.status,
    startedAt,
    endedAt,
    durationMs: Math.max(left.durationMs, right.durationMs, durationFromTimes(startedAt, endedAt)),
    attemptCount: Math.max(left.attemptCount, right.attemptCount),
    retryCount: Math.max(left.retryCount, right.retryCount),
    errorSummary: left.errorSummary ?? right.errorSummary,
    detailNotes: [...new Set([...(left.detailNotes ?? []), ...(right.detailNotes ?? [])])],
  };
}

function claudeScore(row: ClaudeTaskRecord): number {
  return (row.sessionCount * 1000) + row.totalInputTokens + row.totalOutputTokens + (row.errorSummary ? 1 : 0);
}

function mergeClaudeRows(left: ClaudeTaskRecord, right: ClaudeTaskRecord): ClaudeTaskRecord {
  const leftSessions = new Set(left.sessionIds);
  const overlap = right.sessionIds.some((sessionId) => leftSessions.has(sessionId));
  const sessionIds = [...new Set([...left.sessionIds, ...right.sessionIds])];

  if (overlap) {
    const primary = claudeScore(left) >= claudeScore(right) ? left : right;
    const secondary = primary === left ? right : left;
    return {
      phase: primary.phase,
      taskId: primary.taskId,
      workerId: primary.workerId ?? secondary.workerId,
      batchId: primary.batchId ?? secondary.batchId,
      taskName: primary.taskName ?? secondary.taskName,
      poiId: primary.poiId ?? secondary.poiId,
      city: primary.city ?? secondary.city,
      sessionIds,
      startedAt: pickMinTime(primary.startedAt, secondary.startedAt),
      endedAt: pickMaxTime(primary.endedAt, secondary.endedAt),
      totalInputTokens: Math.max(primary.totalInputTokens, secondary.totalInputTokens),
      totalOutputTokens: Math.max(primary.totalOutputTokens, secondary.totalOutputTokens),
      totalCacheTokens: Math.max(primary.totalCacheTokens, secondary.totalCacheTokens),
      totalCostUsd: Math.max(primary.totalCostUsd, secondary.totalCostUsd),
      totalDurationMs: Math.max(primary.totalDurationMs, secondary.totalDurationMs),
      totalToolCalls: Math.max(primary.totalToolCalls, secondary.totalToolCalls),
      totalToolErrors: Math.max(primary.totalToolErrors, secondary.totalToolErrors),
      sessionCount: sessionIds.length,
      errorSummary: primary.errorSummary ?? secondary.errorSummary,
    };
  }

  return {
    phase: left.phase,
    taskId: left.taskId,
    workerId: left.workerId ?? right.workerId,
    batchId: left.batchId ?? right.batchId,
    taskName: left.taskName ?? right.taskName,
    poiId: left.poiId ?? right.poiId,
    city: left.city ?? right.city,
    sessionIds,
    startedAt: pickMinTime(left.startedAt, right.startedAt),
    endedAt: pickMaxTime(left.endedAt, right.endedAt),
    totalInputTokens: left.totalInputTokens + right.totalInputTokens,
    totalOutputTokens: left.totalOutputTokens + right.totalOutputTokens,
    totalCacheTokens: left.totalCacheTokens + right.totalCacheTokens,
    totalCostUsd: left.totalCostUsd + right.totalCostUsd,
    totalDurationMs: left.totalDurationMs + right.totalDurationMs,
    totalToolCalls: left.totalToolCalls + right.totalToolCalls,
    totalToolErrors: left.totalToolErrors + right.totalToolErrors,
    sessionCount: sessionIds.length,
    errorSummary: left.errorSummary ?? right.errorSummary,
  };
}

async function parsePhaseFromFiles(files: ImportFileItem[], phase: AnalysisPhase): Promise<AggregatedTaskRun[]> {
  const batchByTask = new Map<string, BatchTaskRecord>();
  const claudeByTask = new Map<string, ClaudeTaskRecord>();

  const mergeBatchList = (rows: BatchTaskRecord[]) => {
    for (const row of rows) {
      const existing = batchByTask.get(row.taskId);
      batchByTask.set(row.taskId, existing ? mergeBatchRows(existing, row) : row);
    }
  };

  const mergeClaudeList = (rows: ClaudeTaskRecord[]) => {
    for (const row of rows) {
      const existing = claudeByTask.get(row.taskId);
      claudeByTask.set(row.taskId, existing ? mergeClaudeRows(existing, row) : row);
    }
  };

  for (const item of files) {
    const role = await resolveRole(item);

    if (role === "executor") {
      try {
        mergeBatchList(await parseBatchExecutorLogFile(item.filePath, phase));
      } catch {
        // ignore bad file
      }
      continue;
    }

    if (role === "claude") {
      try {
        mergeClaudeList(await parseClaudeTaskLogFile(item.filePath, phase));
      } catch {
        // ignore bad file
      }
      continue;
    }

    // Unknown role: try both and keep the parser with better signal.
    try {
      const [batchRows, claudeRows] = await Promise.all([
        parseBatchExecutorLogFile(item.filePath, phase).catch(() => [] as BatchTaskRecord[]),
        parseClaudeTaskLogFile(item.filePath, phase).catch(() => [] as ClaudeTaskRecord[]),
      ]);
      mergeBatchList(batchRows);
      mergeClaudeList(claudeRows);
    } catch {
      // ignore bad file
    }
  }

  return buildAggregatedRows(phase, [...batchByTask.values()], [...claudeByTask.values()]);
}

async function buildImportPayloadFromFiles(payload: ImportFilesPayload): Promise<ImportPayload> {
  const verifyExecutorLogs: string[] = [];
  const verifyClaudeLogs: string[] = [];
  const qcExecutorLogs: string[] = [];
  const qcClaudeLogs: string[] = [];

  for (const item of payload.files) {
    const role = await resolveRole(item);
    const content = normalizeLogContent(await fs.readFile(item.filePath, "utf8"));
    if (!content.trim()) continue;

    if (item.phase === "verify") {
      if (role === "claude") {
        verifyClaudeLogs.push(content);
      } else {
        verifyExecutorLogs.push(content);
      }
      continue;
    }

    if (role === "claude") {
      qcClaudeLogs.push(content);
    } else {
      qcExecutorLogs.push(content);
    }
  }

  return {
    source: payload.source,
    verifyExecutorLog: verifyExecutorLogs.length ? verifyExecutorLogs.join("\n") : undefined,
    verifyClaudeLog: verifyClaudeLogs.length ? verifyClaudeLogs.join("\n") : undefined,
    qcExecutorLog: qcExecutorLogs.length ? qcExecutorLogs.join("\n") : undefined,
    qcClaudeLog: qcClaudeLogs.length ? qcClaudeLogs.join("\n") : undefined,
  };
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

  async importLogFiles(payload: ImportFilesPayload): Promise<ImportResult> {
    const verifyFiles = payload.files.filter((item) => item.phase === "verify");
    const qcFiles = payload.files.filter((item) => item.phase === "qc");

    const [verifyRows, qcRows, importPayload] = await Promise.all([
      parsePhaseFromFiles(verifyFiles, "verify"),
      parsePhaseFromFiles(qcFiles, "qc"),
      buildImportPayloadFromFiles(payload),
    ]);
    const allRows = [...verifyRows, ...qcRows];

    const batchId = this.repository.nextImportBatchId();
    if (allRows.length > 0) {
      await this.repository.insertAggregatedRuns(batchId, allRows);
    }

    await this.repository.insertImport(
      importPayload,
      batchId,
      verifyRows.length,
      qcRows.length,
      allRows.length,
    );

    return {
      batchId,
      verifyTaskCount: verifyRows.length,
      qcTaskCount: qcRows.length,
      totalTaskRuns: allRows.length,
    };
  }
}
