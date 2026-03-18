import type { ParsedEvent } from "../../lib/types";

function eventSummary(event: ParsedEvent): string {
  if (event.type === "tool_use") return `调用工具: ${event.toolName ?? "unknown"}`;
  if (event.type === "tool_result") return `工具结果: ${event.toolName ?? "unknown"}${event.isError ? " (error)" : ""}`;
  if (event.type === "assistant" || event.type === "user") return event.text ?? "(空)";
  return event.type;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function cardStyle(type: ParsedEvent["type"]): string {
  if (type === "assistant") return "border-violet-200 bg-violet-50/70";
  if (type === "tool_use") return "border-amber-200 bg-amber-50/80";
  if (type === "tool_result") return "border-sky-200 bg-sky-50/80";
  if (type === "user") return "border-emerald-200 bg-emerald-50/80";
  return "border-slate-200 bg-white";
}

function markerStyle(type: ParsedEvent["type"]): string {
  if (type === "assistant") return "bg-violet-500";
  if (type === "tool_use") return "bg-amber-500";
  if (type === "tool_result") return "bg-sky-500";
  if (type === "user") return "bg-emerald-500";
  return "bg-slate-400";
}

export function TimelineView({ timeline }: { timeline: ParsedEvent[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_34px]">
      <div className="max-h-[62vh] space-y-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {timeline.length === 0 ? <div className="text-xs text-slate-400">暂无时间线内容</div> : null}
        {timeline.map((event) => (
          <div key={event.id} className="grid grid-cols-[14px_1fr] gap-2">
            <div className="mt-2 h-3 w-3 rounded-full border border-white shadow-sm" style={{ background: "white" }}>
              <div className={`h-3 w-3 rounded-full ${markerStyle(event.type)}`} />
            </div>
            <details className={`rounded-xl border px-3 py-2 text-xs text-slate-700 shadow-sm ${cardStyle(event.type)}`}>
              <summary className="cursor-pointer">
                <span className="font-semibold uppercase tracking-wide">{event.type}</span>
                <span className="ml-2 text-slate-600">{eventSummary(event).slice(0, 120)}</span>
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                {formatJson(event.raw)}
              </pre>
            </details>
          </div>
        ))}
      </div>
      <div className="hidden max-h-[62vh] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 lg:block">
        <div className="h-full space-y-[3px] overflow-hidden">
          {timeline.slice(0, 180).map((event) => (
            <div key={`mini_${event.id}`} className={`h-[3px] rounded ${markerStyle(event.type)}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

