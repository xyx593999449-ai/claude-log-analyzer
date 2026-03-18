import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Clock3, Coins, Database, FileSearch, Hammer, ListTree } from "lucide-react";
import { parseNDJSON } from "../../lib/parser";
import type { LogAnalysis, ParsedEvent } from "../../lib/types";

interface LogAnalysisPanelProps {
  title: string;
  rawLog: string;
  sessionIds?: string[];
}

type LogTab = "timeline" | "tools" | "raw";

function createEmptyAnalysis(): LogAnalysis {
  return {
    events: [],
    timeline: [],
    stats: {
      totalCost: 0,
      totalDuration: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      toolCounts: {},
      toolErrors: {},
    },
    sessions: {},
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatDuration(ms: number): string {
  if (!ms) return "0s";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderEventText(event: ParsedEvent): string {
  if (event.type === "tool_use") {
    return `调用工具: ${event.toolName ?? "unknown"}`;
  }
  if (event.type === "tool_result") {
    return `工具结果: ${event.toolName ?? "unknown"}${event.isError ? " (error)" : ""}`;
  }
  if (event.type === "assistant" || event.type === "user") {
    return event.text ?? "";
  }
  return event.text ?? event.type;
}

export function LogAnalysisPanel({ title, rawLog, sessionIds = [] }: LogAnalysisPanelProps) {
  const [tab, setTab] = useState<LogTab>("timeline");
  const [analysis, setAnalysis] = useState<LogAnalysis>(createEmptyAnalysis());
  const [parseError, setParseError] = useState<string>("");

  const deferredRaw = useDeferredValue(rawLog);

  useEffect(() => {
    startTransition(() => {
      if (!deferredRaw.trim()) {
        setAnalysis(createEmptyAnalysis());
        setParseError("");
        return;
      }

      try {
        const parsed = parseNDJSON(deferredRaw);
        setAnalysis(parsed);
        setParseError("");
      } catch (error) {
        setParseError(error instanceof Error ? error.message : "日志解析失败");
        setAnalysis(createEmptyAnalysis());
      }
    });
  }, [deferredRaw]);

  const toolRows = Object.entries(analysis.stats.toolCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([name, count]) => ({
      name,
      count,
      error: analysis.stats.toolErrors[name] ?? 0,
    }));

  const timeline = analysis.timeline.slice(0, 300);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <p className="text-xs text-zinc-500">session_ids: {sessionIds.join(", ") || "-"}</p>
        </div>
        <div className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{analysis.events.length} events</div>
      </div>

      <div className="mb-4 grid gap-2 text-xs md:grid-cols-4">
        <MetricBadge icon={<ListTree className="h-3.5 w-3.5" />} label="会话数" value={String(Object.keys(analysis.sessions).length)} />
        <MetricBadge icon={<Clock3 className="h-3.5 w-3.5" />} label="总耗时" value={formatDuration(analysis.stats.totalDuration)} />
        <MetricBadge
          icon={<Database className="h-3.5 w-3.5" />}
          label="Token"
          value={`${formatNumber(analysis.stats.inputTokens + analysis.stats.outputTokens)} (${formatNumber(analysis.stats.inputTokens)} / ${formatNumber(analysis.stats.outputTokens)})`}
        />
        <MetricBadge icon={<Coins className="h-3.5 w-3.5" />} label="日志成本(原值)" value={`$${analysis.stats.totalCost.toFixed(4)}`} />
      </div>

      <div className="mb-3 flex gap-2 text-xs">
        <TabButton tab="timeline" current={tab} onClick={setTab} label="时间线" />
        <TabButton tab="tools" current={tab} onClick={setTab} label="工具统计" />
        <TabButton tab="raw" current={tab} onClick={setTab} label="原始日志" />
      </div>

      {parseError ? (
        <div className="mb-3 inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5" /> {parseError}
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className="max-h-[60vh] space-y-2 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          {timeline.length === 0 ? <div className="text-xs text-zinc-400">暂无可展示时间线</div> : null}
          {timeline.map((event) => (
            <details key={event.id} className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
              <summary className="cursor-pointer">
                <span className="font-medium">[{event.type}]</span> {renderEventText(event).slice(0, 110) || "(空内容)"}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-900 p-2 text-[11px] text-zinc-100">
                {formatJson(event.raw)}
              </pre>
            </details>
          ))}
        </div>
      ) : null}

      {tab === "tools" ? (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          {toolRows.length === 0 ? <div className="text-xs text-zinc-400">暂无工具调用</div> : null}
          <div className="space-y-2">
            {toolRows.map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-xs">
                <div className="inline-flex items-center gap-1 font-medium text-zinc-700">
                  <Hammer className="h-3.5 w-3.5" />
                  {row.name}
                </div>
                <div className="text-zinc-500">
                  调用 {row.count} / 错误 {row.error}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "raw" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500">
            <FileSearch className="h-3.5 w-3.5" /> 原始 NDJSON
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">
            {rawLog || "暂无匹配日志"}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function MetricBadge({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2">
      <div className="mb-1 inline-flex items-center gap-1 text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="text-zinc-800">{value}</div>
    </div>
  );
}

function TabButton({
  tab,
  current,
  onClick,
  label,
}: {
  tab: LogTab;
  current: LogTab;
  onClick: (tab: LogTab) => void;
  label: string;
}) {
  const active = current === tab;
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`rounded-full px-3 py-1 ${active ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100"}`}
    >
      {label}
    </button>
  );
}



