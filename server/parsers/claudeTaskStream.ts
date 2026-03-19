import fs from "node:fs";
import readline from "node:readline";
import type { AnalysisPhase, ClaudeTaskRecord } from "../types";

interface TaskBinding {
  taskId: string;
  taskName: string | null;
  poiId: string | null;
  workerId: string | null;
  batchId: string | null;
  city: string | null;
}

interface SessionAccumulator {
  sessionId: string;
  binding: TaskBinding | null;
  startTime: string | null;
  endTime: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  toolCounts: Map<string, number>;
  toolErrors: Map<string, number>;
  toolIdToName: Map<string, string>;
  errorSummary: string | null;
}

function safeNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function extractTimestamp(id: string | undefined): string | null {
  if (!id) return null;
  const match = id.match(/^msg_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
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

function normalizeTimeForParse(value: string): string {
  if (value.includes("T")) return value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(" ", "T");
  }
  return value;
}

function minTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(normalizeTimeForParse(a));
  const tb = Date.parse(normalizeTimeForParse(b));
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
    return ta <= tb ? a : b;
  }
  return a.localeCompare(b) <= 0 ? a : b;
}

function maxTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(normalizeTimeForParse(a));
  const tb = Date.parse(normalizeTimeForParse(b));
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
    return ta >= tb ? a : b;
  }
  return a.localeCompare(b) >= 0 ? a : b;
}

function ensureSession(map: Map<string, SessionAccumulator>, sessionId: string): SessionAccumulator {
  let session = map.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      binding: null,
      startTime: null,
      endTime: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      toolCounts: new Map<string, number>(),
      toolErrors: new Map<string, number>(),
      toolIdToName: new Map<string, string>(),
      errorSummary: null,
    };
    map.set(sessionId, session);
  }
  return session;
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

function bumpCounter(counter: Map<string, number>, key: string): void {
  const current = counter.get(key) ?? 0;
  counter.set(key, current + 1);
}

function extractBindingFromContent(content: unknown, session: SessionAccumulator): TaskBinding | null {
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const typed = block as Record<string, unknown>;
      const blockType = typeof typed.type === "string" ? typed.type : "";

      if (blockType === "tool_use") {
        const name = typeof typed.name === "string" ? typed.name : "unknown";
        bumpCounter(session.toolCounts, name);
        if (typeof typed.id === "string") {
          session.toolIdToName.set(typed.id, name);
        }

        if (name === "Skill" && typed.input && typeof typed.input === "object") {
          const args = (typed.input as Record<string, unknown>).args;
          if (typeof args === "string") {
            const parsed = normalizeTaskPayload(tryParseObject(args));
            if (parsed) return parsed;
          }
        }
      }

      if (blockType === "tool_result") {
        const useId = typeof typed.tool_use_id === "string" ? typed.tool_use_id : null;
        const toolName =
          (typeof typed.name === "string" ? typed.name : null)
          ?? (useId ? session.toolIdToName.get(useId) ?? useId : "unknown");
        if (typed.is_error === true) {
          bumpCounter(session.toolErrors, toolName);
          if (!session.errorSummary && typeof typed.content === "string" && typed.content.trim()) {
            session.errorSummary = typed.content.slice(0, 300);
          }
        }
        if (typeof typed.content === "string") {
          const parsed = parseArgumentsText(typed.content);
          if (parsed) return parsed;
        }
      }

      if (blockType === "text" && typeof typed.text === "string") {
        const parsed = parseArgumentsText(typed.text);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  if (typeof content === "string") {
    return parseArgumentsText(content);
  }
  return null;
}

function firstNonEmptyText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const typed = block as Record<string, unknown>;
    if (typed.type === "text" && typeof typed.text === "string" && typed.text.trim()) {
      return typed.text;
    }
    if (typed.type === "tool_result" && typeof typed.content === "string" && typed.content.trim()) {
      return typed.content;
    }
  }
  return null;
}

export async function parseClaudeTaskLogFile(filePath: string, phase: AnalysisPhase): Promise<ClaudeTaskRecord[]> {
  const sessions = new Map<string, SessionAccumulator>();
  let lineNumber = 0;

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (let line of rl) {
      lineNumber += 1;
      if (lineNumber === 1) {
        line = line.replace(/^\uFEFF/, "");
      }
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("{")) continue;

      let rawObj: Record<string, unknown>;
      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object") continue;
        rawObj = parsed as Record<string, unknown>;
      } catch {
        continue;
      }

      const message =
        rawObj.message && typeof rawObj.message === "object"
          ? (rawObj.message as Record<string, unknown>)
          : rawObj;

      const sessionId =
        (typeof rawObj.session_id === "string" ? rawObj.session_id : null)
        ?? (typeof message.session_id === "string" ? message.session_id : null)
        ?? "unknown_session";
      const session = ensureSession(sessions, sessionId);

      const timestamp = extractTimestamp(typeof message.id === "string" ? message.id : undefined);
      if (timestamp) {
        session.startTime = minTimestamp(session.startTime, timestamp);
        session.endTime = maxTimestamp(session.endTime, timestamp);
      }

      const usage = message.usage && typeof message.usage === "object"
        ? (message.usage as Record<string, unknown>)
        : null;
      if (usage) {
        session.inputTokens += safeNumber(usage.input_tokens);
        session.outputTokens += safeNumber(usage.output_tokens);
        session.cacheTokens += safeNumber(usage.cache_creation_input_tokens) + safeNumber(usage.cache_read_input_tokens);
      }
      session.totalCostUsd += safeNumber(message.cost_usd);
      session.totalDurationMs += safeNumber(message.duration_ms);

      const directType = typeof rawObj.type === "string" ? rawObj.type : "";
      if (directType === "content_block_start" && rawObj.content_block && typeof rawObj.content_block === "object") {
        const contentBlock = rawObj.content_block as Record<string, unknown>;
        if (contentBlock.type === "tool_use") {
          const name = typeof contentBlock.name === "string" ? contentBlock.name : "unknown";
          bumpCounter(session.toolCounts, name);
          if (typeof contentBlock.id === "string") {
            session.toolIdToName.set(contentBlock.id, name);
          }
        }
      }

      const binding = extractBindingFromContent(message.content, session);
      if (binding && !session.binding) {
        session.binding = binding;
      }

      if (!session.errorSummary) {
        const text = firstNonEmptyText(message.content);
        if (text && /(error|exception|failed|失败)/i.test(text)) {
          session.errorSummary = text.slice(0, 300);
        }
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  const records = new Map<string, ClaudeTaskRecord>();

  for (const session of sessions.values()) {
    if (!session.binding) continue;
    const record = ensureRecord(records, phase, session.binding);
    record.workerId ??= session.binding.workerId;
    record.batchId ??= session.binding.batchId;
    record.taskName ??= session.binding.taskName;
    record.poiId ??= session.binding.poiId;
    record.city ??= session.binding.city;
    record.sessionIds.push(session.sessionId);
    record.sessionCount += 1;
    record.startedAt = minTimestamp(record.startedAt, session.startTime);
    record.endedAt = maxTimestamp(record.endedAt, session.endTime);
    record.totalInputTokens += session.inputTokens;
    record.totalOutputTokens += session.outputTokens;
    record.totalCacheTokens += session.cacheTokens;
    record.totalCostUsd += session.totalCostUsd;
    record.totalDurationMs += session.totalDurationMs;
    record.totalToolCalls += [...session.toolCounts.values()].reduce((sum, value) => sum + value, 0);
    record.totalToolErrors += [...session.toolErrors.values()].reduce((sum, value) => sum + value, 0);
    record.errorSummary ??= session.errorSummary;
  }

  for (const record of records.values()) {
    record.sessionIds = [...new Set(record.sessionIds)];
    record.sessionCount = record.sessionIds.length;
  }

  return [...records.values()];
}
