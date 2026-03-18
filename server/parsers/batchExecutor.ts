import type { AnalysisPhase, BatchTaskRecord } from "../types";

const TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})/;
const RE_WORKER_ID = /Worker ID:\s*([0-9]+)/;
const RE_BATCH_ID = /batch_id:\s*([A-Z0-9_]+)/;
const RE_ROW_START = />>> \[\u7b2c\s*(\d+)\s*\u884c\]\s*\u5f00\u59cb\u5904\u7406/;
const RE_ATTEMPT = /\[\u9636\u6bb5\u4e09\]\s*\u7b2c\s*(\d+)\s*\u6b21\u5c1d\u8bd5/;
const RE_INPUT = /\[\u9636\u6bb5\u4e09\]\s*\u8f93\u5165\u6570\u636e:\s*(.+)$/;
const RE_COMPLETION =
  />>> \[\u7b2c\s*(\d+)\s*\u884c\]\s*(?:\u5904\u7406\u5b8c\u6210|\u8df3\u8fc7\u5904\u7406)\s*-\s*\u72b6\u6001:\s*([a-zA-Z_]+)/;
const RE_SKIP_REASON = /\[\u8df3\u8fc7\u539f\u56e0\]\s*(.+)$/;
const RE_MISSING_TASK_FILE = /\u672a\u627e\u5230\s*task_id=([a-zA-Z0-9-]+)/;

function parseLogTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(" ", "T").replace(",", ".");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function durationMs(startedAt: string | null, endedAt: string | null): number {
  const start = parseLogTimestamp(startedAt);
  const end = parseLogTimestamp(endedAt);
  if (start === null || end === null || end < start) return 0;
  return end - start;
}

function extractTimestamp(line: string): string | null {
  return line.match(TIMESTAMP_PREFIX)?.[1] ?? null;
}

function extractQuotedValue(text: string, key: string): string | null {
  return text.match(new RegExp(`'${key}'\\s*:\\s*'([^']*)'`))?.[1] ?? null;
}

function extractNumericOrWordValue(text: string, key: string): string | null {
  const match = text.match(new RegExp(`'${key}'\\s*:\\s*([^,}\\]]+)`));
  if (!match) return null;
  return match[1].trim().replace(/^'+|'+$/g, "");
}

function ensureRecord(
  map: Map<string, BatchTaskRecord>,
  phase: AnalysisPhase,
  taskId: string,
): BatchTaskRecord {
  let record = map.get(taskId);
  if (!record) {
    record = {
      phase,
      taskId,
      rowNumber: null,
      workerId: null,
      batchId: null,
      taskName: null,
      poiId: null,
      city: null,
      status: null,
      startedAt: null,
      endedAt: null,
      durationMs: 0,
      attemptCount: 0,
      retryCount: 0,
      errorSummary: null,
      detailNotes: [],
    };
    map.set(taskId, record);
  }
  return record;
}

export function parseBatchExecutorLog(content: string, phase: AnalysisPhase): BatchTaskRecord[] {
  const records = new Map<string, BatchTaskRecord>();
  const taskByRow = new Map<number, string>();
  const lines = content.split(/\r?\n/);

  let activeTaskId: string | null = null;
  let activeRow: number | null = null;
  let globalBatchId: string | null = null;
  let globalWorkerId: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const timestamp = extractTimestamp(line);

    const workerMatch = line.match(RE_WORKER_ID);
    if (workerMatch) globalWorkerId = workerMatch[1];

    const batchMatch = line.match(RE_BATCH_ID);
    if (batchMatch) globalBatchId = batchMatch[1];

    const rowStart = line.match(RE_ROW_START);
    if (rowStart) {
      activeRow = Number(rowStart[1]);
      activeTaskId = taskByRow.get(activeRow) ?? null;
      continue;
    }

    const inputMatch = line.match(RE_INPUT);
    if (inputMatch) {
      const payload = inputMatch[1];
      const extractedTaskId = extractQuotedValue(payload, "task_id");
      const fallbackTaskId = activeRow !== null ? taskByRow.get(activeRow) ?? null : null;
      const taskId = extractedTaskId ?? fallbackTaskId;

      if (!taskId) continue;
      if (activeRow !== null) taskByRow.set(activeRow, taskId);
      activeTaskId = taskId;

      const record = ensureRecord(records, phase, taskId);
      record.rowNumber ??= activeRow;
      record.workerId ??= extractNumericOrWordValue(payload, "worker_id") ?? globalWorkerId;
      record.batchId ??= extractQuotedValue(payload, "batch_id") ?? globalBatchId;
      record.taskName ??= extractQuotedValue(payload, "name");
      record.poiId ??= extractQuotedValue(payload, "poi_id") ?? extractQuotedValue(payload, "id");
      record.city ??= extractQuotedValue(payload, "city");
      record.startedAt ??= timestamp;
      continue;
    }

    const attemptMatch = line.match(RE_ATTEMPT);
    if (attemptMatch && activeTaskId) {
      const record = ensureRecord(records, phase, activeTaskId);
      record.attemptCount = Math.max(record.attemptCount, Number(attemptMatch[1]));
      record.startedAt ??= timestamp;
      continue;
    }

    const completionMatch = line.match(RE_COMPLETION);
    if (completionMatch) {
      const rowNo = Number(completionMatch[1]);
      const status = completionMatch[2];
      const taskId = taskByRow.get(rowNo) ?? activeTaskId;
      if (!taskId) continue;

      const record = ensureRecord(records, phase, taskId);
      record.rowNumber ??= rowNo;
      record.status = status;
      record.endedAt = timestamp;
      record.durationMs = durationMs(record.startedAt, record.endedAt);
      record.retryCount = Math.max(record.retryCount, Math.max(record.attemptCount - 1, 0));
      continue;
    }

    const skipMatch = line.match(RE_SKIP_REASON);
    if (skipMatch && activeTaskId) {
      ensureRecord(records, phase, activeTaskId).errorSummary = skipMatch[1];
      continue;
    }

    if (line.includes("\u4e3b\u6280\u80fd\u6267\u884c\u5931\u8d25") && activeTaskId) {
      ensureRecord(records, phase, activeTaskId).errorSummary = line.trim();
      continue;
    }

    const missingTaskMatch = line.match(RE_MISSING_TASK_FILE);
    if (missingTaskMatch) {
      ensureRecord(records, phase, missingTaskMatch[1]).errorSummary = line.trim();
    }
  }

  return [...records.values()].map((record) => ({
    ...record,
    durationMs: record.durationMs || durationMs(record.startedAt, record.endedAt),
    retryCount: Math.max(record.retryCount, Math.max(record.attemptCount - 1, 0)),
  }));
}
