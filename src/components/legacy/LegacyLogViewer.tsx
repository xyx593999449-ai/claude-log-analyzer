import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Clock3, FileCode2, ListTree, PiggyBank, Wrench } from "lucide-react";
import { parseNDJSON } from "../../lib/parser";
import type { LogAnalysis } from "../../lib/types";
import { TimelineView } from "./TimelineView";
import { TokenAnalysisView } from "./TokenAnalysisView";
import { ToolAnalysisView } from "./ToolAnalysisView";

type TabKey = "timeline" | "tools" | "token" | "raw";

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

export function LegacyLogViewer({
  title,
  rawLog,
  sessionIds = [],
}: {
  title: string;
  rawLog: string;
  sessionIds?: string[];
}) {
  const deferredRaw = useDeferredValue(rawLog);
  const [tab, setTab] = useState<TabKey>("timeline");
  const [analysis, setAnalysis] = useState<LogAnalysis>(createEmptyAnalysis());
  const [error, setError] = useState("");

  useEffect(() => {
    startTransition(() => {
      if (!deferredRaw.trim()) {
        setAnalysis(createEmptyAnalysis());
        setError("");
        return;
      }
      try {
        setAnalysis(parseNDJSON(deferredRaw));
        setError("");
      } catch (err) {
        setAnalysis(createEmptyAnalysis());
        setError(err instanceof Error ? err.message : "日志解析失败");
      }
    });
  }, [deferredRaw]);

  const toolKinds = useMemo(() => Object.keys(analysis.stats.toolCounts).length, [analysis.stats.toolCounts]);
  const sessionCount = Object.keys(analysis.sessions).length;
  const toolErrorCount = useMemo(
    () => Object.values(analysis.stats.toolErrors).reduce<number>((sum, value) => sum + Number(value ?? 0), 0),
    [analysis.stats.toolErrors],
  );
  const hasExecutionError = toolErrorCount > 0;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/84 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Log Analysis</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(sessionIds.length ? sessionIds : ["无 session_id"]).slice(0, 4).map((sessionId) => (
              <span key={sessionId} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {sessionId}
              </span>
            ))}
            {sessionIds.length > 4 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                +{sessionIds.length - 4} 个 session
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          {analysis.events.length} events
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Activity className="h-4 w-4 text-teal-700" />} label="事件数" value={formatNumber(analysis.events.length)} />
        <MetricCard icon={<Clock3 className="h-4 w-4 text-cyan-700" />} label="总耗时" value={formatDuration(analysis.stats.totalDuration)} />
        <MetricCard icon={<ListTree className="h-4 w-4 text-indigo-700" />} label="时间线节点" value={formatNumber(analysis.timeline.length)} />
        <MetricCard icon={<Wrench className="h-4 w-4 text-amber-700" />} label="工具类型 / 会话数" value={`${toolKinds} / ${sessionCount || sessionIds.length}`} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")} label="执行时间线" icon={<ListTree className="h-3.5 w-3.5" />} />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} label="工具调用" icon={<Wrench className="h-3.5 w-3.5" />} />
        <TabButton active={tab === "token"} onClick={() => setTab("token")} label="Token 与成本" icon={<PiggyBank className="h-3.5 w-3.5" />} />
        <TabButton active={tab === "raw"} onClick={() => setTab("raw")} label="原始日志" icon={<FileCode2 className="h-3.5 w-3.5" />} />
      </div>

      {hasExecutionError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-[0_12px_30px_rgba(244,63,94,0.12)]">
          <div className="font-semibold">执行异常</div>
          <div className="mt-1">
            识别到 <span className="font-semibold">{toolErrorCount}</span> 次工具或执行错误
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

      <div className="mt-5">
        {tab === "timeline" ? <TimelineView timeline={analysis.timeline.slice(0, 300)} /> : null}
        {tab === "tools" ? <ToolAnalysisView stats={analysis.stats} /> : null}
        {tab === "token" ? <TokenAnalysisView stats={analysis.stats} /> : null}
        {tab === "raw" ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-400">Raw Log</div>
            <pre className="ide-scrollbar max-h-[56vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-3 text-[11px] text-slate-100">
              {rawLog || "暂无日志"}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
        active ? "bg-slate-950 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
