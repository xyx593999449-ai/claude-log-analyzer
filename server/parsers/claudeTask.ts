import { parseNDJSON } from "../../src/lib/parser";
import type { SessionData } from "../../src/lib/types";
import type { AnalysisPhase, ClaudeTaskRecord } from "../types";

interface TaskBinding {
  taskId: string;
  taskName: string | null;
  poiId: string | null;
  workerId: string | null;
  batchId: string | null;
  city: string | null;
}

function normalizeTaskPayload(value: unknown): TaskBinding | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const taskId = typeof payload.task_id === "string" ? payload.task_id : null;
  if (!taskId) return null;

  return {
    taskId,
    taskName: typeof payload.name === "string" ? payload.name : null,
    poiId:
      typeof payload.poi_id === "string"
        ? payload.poi_id
        : typeof payload.id === "string"
          ? payload.id
          : null,
    workerId:
      typeof payload.worker_id === "string"
        ? payload.worker_id
        : typeof payload.worker_id === "number"
          ? String(payload.worker_id)
          : null,
    batchId: typeof payload.batch_id === "string" ? payload.batch_id : null,
    city: typeof payload.city === "string" ? payload.city : null,
  };
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseArgumentsText(text: string): TaskBinding | null {
  const match = text.match(/ARGUMENTS:\s*(\{[\s\S]*\})\s*$/);
  if (!match) return null;
  return normalizeTaskPayload(tryParseObject(match[1]));
}

function extractBindingFromSession(session: SessionData): TaskBinding | null {
  for (const event of session.events) {
    const raw = event.raw as Record<string, unknown>;
    const message = (raw.message ?? raw) as Record<string, unknown>;
    const content = message.content;

    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const typed = block as Record<string, unknown>;

        if (typed.type === "tool_use" && typed.name === "Skill" && typed.input && typeof typed.input === "object") {
          const args = (typed.input as Record<string, unknown>).args;
          if (typeof args === "string") {
            const parsed = normalizeTaskPayload(tryParseObject(args));
            if (parsed) return parsed;
          }
        }

        if (typed.type === "text" && typeof typed.text === "string") {
          const parsed = parseArgumentsText(typed.text);
          if (parsed) return parsed;
        }

        if (typed.type === "tool_result" && typeof typed.content === "string") {
          const parsed = parseArgumentsText(typed.content);
          if (parsed) return parsed;
        }
      }
    } else if (typeof content === "string") {
      const parsed = parseArgumentsText(content);
      if (parsed) return parsed;
    }
  }

  return null;
}

function extractErrorSummary(session: SessionData): string | null {
  for (const event of session.events) {
    if (!event.isError) continue;
    if (typeof event.toolResult === "string" && event.toolResult.trim()) {
      return event.toolResult.slice(0, 300);
    }
    if (event.toolName) return `${event.toolName} failed`;
  }

  for (const event of [...session.events].reverse()) {
    if (typeof event.text === "string" && /(error|exception|failed|失败)/i.test(event.text)) {
      return event.text.slice(0, 300);
    }
  }

  return null;
}

function ensureRecord(
  map: Map<string, ClaudeTaskRecord>,
  phase: AnalysisPhase,
  binding: TaskBinding,
): ClaudeTaskRecord {
  let record = map.get(binding.taskId);
  if (!record) {
    record = {
      phase,
      taskId: binding.taskId,
      workerId: binding.workerId,
      batchId: binding.batchId,
      taskName: binding.taskName,
      poiId: binding.poiId,
      city: binding.city,
      sessionIds: [],
      startedAt: null,
      endedAt: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      totalToolCalls: 0,
      totalToolErrors: 0,
      sessionCount: 0,
      errorSummary: null,
    };
    map.set(binding.taskId, record);
  }
  return record;
}

function minTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) <= 0 ? a : b;
}

function maxTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}

export function parseClaudeTaskLog(content: string, phase: AnalysisPhase): ClaudeTaskRecord[] {
  const nonEmptyLines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return [];

  // Fast guard: Claude NDJSON should mostly be JSON lines.
  const sample = nonEmptyLines.slice(0, 30);
  let jsonLike = 0;
  for (const line of sample) {
    if (line.trimStart().startsWith("{")) jsonLike += 1;
  }
  if (jsonLike < Math.ceil(sample.length * 0.5)) {
    return [];
  }

  const analysis = parseNDJSON(content);
  const records = new Map<string, ClaudeTaskRecord>();

  for (const session of Object.values(analysis.sessions)) {
    const binding = extractBindingFromSession(session);
    if (!binding) continue;

    const record = ensureRecord(records, phase, binding);
    record.workerId ??= binding.workerId;
    record.batchId ??= binding.batchId;
    record.taskName ??= binding.taskName;
    record.poiId ??= binding.poiId;
    record.city ??= binding.city;
    record.sessionIds.push(session.sessionId);
    record.sessionCount += 1;
    record.startedAt = minTimestamp(record.startedAt, session.startTime ?? null);
    record.endedAt = maxTimestamp(record.endedAt, session.endTime ?? null);
    record.totalInputTokens += session.stats.inputTokens;
    record.totalOutputTokens += session.stats.outputTokens;
    record.totalCacheTokens += session.stats.cacheTokens;
    record.totalCostUsd += session.stats.totalCost;
    record.totalDurationMs += session.stats.totalDuration;
    record.totalToolCalls += Object.values(session.stats.toolCounts).reduce((sum, value) => sum + value, 0);
    record.totalToolErrors += Object.values(session.stats.toolErrors).reduce((sum, value) => sum + value, 0);
    record.errorSummary ??= extractErrorSummary(session);
  }

  return [...records.values()];
}
