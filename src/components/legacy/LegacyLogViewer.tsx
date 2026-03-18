import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FileCode2, ListTree, PiggyBank, Wrench } from "lucide-react";
import { parseNDJSON } from "../../lib/parser";
import type { LogAnalysis } from "../../lib/types";
import { TimelineView } from "./TimelineView";
import { ToolAnalysisView } from "./ToolAnalysisView";
import { TokenAnalysisView } from "./TokenAnalysisView";

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

export function LegacyLogViewer({ title, rawLog }: { title: string; rawLog: string }) {
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
          {analysis.events.length} events
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <TabButton
          active={tab === "timeline"}
          onClick={() => setTab("timeline")}
          label="执行时间线"
          icon={<ListTree className="h-3.5 w-3.5" />}
        />
        <TabButton
          active={tab === "tools"}
          onClick={() => setTab("tools")}
          label="工具调用分析"
          icon={<Wrench className="h-3.5 w-3.5" />}
        />
        <TabButton
          active={tab === "token"}
          onClick={() => setTab("token")}
          label="Token & 成本"
          icon={<PiggyBank className="h-3.5 w-3.5" />}
        />
        <TabButton
          active={tab === "raw"}
          onClick={() => setTab("raw")}
          label="原始日志"
          icon={<FileCode2 className="h-3.5 w-3.5" />}
        />
      </div>

      {error ? <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div> : null}

      {tab === "timeline" ? <TimelineView timeline={analysis.timeline.slice(0, 300)} /> : null}
      {tab === "tools" ? <ToolAnalysisView stats={analysis.stats} /> : null}
      {tab === "token" ? <TokenAnalysisView stats={analysis.stats} /> : null}
      {tab === "raw" ? (
        <pre className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-[11px] text-slate-100">
          {rawLog || "暂无日志"}
        </pre>
      ) : null}
    </section>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
        active ? "bg-violet-600 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
