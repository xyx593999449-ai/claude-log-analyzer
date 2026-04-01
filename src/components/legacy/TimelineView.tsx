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

function cardStyle(event: ParsedEvent): string {
  if (event.type === "tool_result" && event.isError) return "border-rose-300 bg-rose-50";
  if (event.type === "assistant") return "border-violet-200 bg-violet-50/70";
  if (event.type === "tool_use") return "border-amber-200 bg-amber-50/80";
  if (event.type === "tool_result") return "border-sky-200 bg-sky-50/80";
  if (event.type === "user") return "border-emerald-200 bg-emerald-50/80";
  return "border-slate-200 bg-white";
}

function markerStyle(event: ParsedEvent): string {
  if (event.type === "tool_result" && event.isError) return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] z-10 scale-125";
  if (event.type === "assistant") return "bg-violet-400/60";
  if (event.type === "tool_use") return "bg-amber-400/60";
  if (event.type === "tool_result") return "bg-sky-400/60";
  if (event.type === "user") return "bg-emerald-400/60";
  return "bg-slate-300";
}

function scrollToEvent(id: string) {
  const el = document.getElementById(`log-event-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add brief highlight flash
    el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2');
    setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2'), 1500);
  }
}

export function TimelineView({ timeline }: { timeline: ParsedEvent[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_48px]">
      <div className="ide-scrollbar max-h-[62vh] space-y-4 overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4 relative" id="timeline-container">
        {timeline.length === 0 ? <div className="text-xs text-slate-400">暂无时间线</div> : null}
        {timeline.map((event) => {
          const isError = event.type === "tool_result" && event.isError;
          return (
            <div key={event.id} id={`log-event-${event.id}`} className="grid grid-cols-[16px_1fr] gap-3 transition-all duration-500 rounded-xl">
              <div className="mt-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200">
                <div className={`h-2.5 w-2.5 rounded-full ${isError ? 'bg-rose-500 animate-pulse' : markerStyle(event).split(' ')[0]}`} />
              </div>
              <details className={`rounded-xl border px-4 py-3 text-xs shadow-sm transition-shadow hover:shadow-md ${isError ? 'border-l-4 border-l-rose-500 border-y-rose-200 border-r-rose-200 bg-rose-50' : cardStyle(event)}`} open={isError}>
                <summary className="cursor-pointer list-none flex items-start gap-2">
                  <span className={`font-bold uppercase tracking-wider shrink-0 mt-0.5 ${isError ? 'text-rose-700' : 'text-slate-800'}`}>{event.type}</span>
                  <span className={`leading-relaxed flex-1 ${isError ? 'text-rose-900 font-medium' : 'text-slate-600'}`}>{eventSummary(event)}</span>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
                    {event.usage ? (
                      <span className="flex items-center gap-1.5 rounded-md border border-slate-200/60 bg-white/60 px-2 py-0.5 text-[10px] text-slate-500 font-mono shadow-sm">
                        <span title="输入 Tokens">↑ {(event.usage.input_tokens || 0) + (event.usage.cache_creation_input_tokens || 0) + (event.usage.cache_read_input_tokens || 0)}</span>
                        <span className="text-slate-300">|</span>
                        <span title="输出 Tokens">↓ {event.usage.output_tokens || 0}</span>
                        <span className="text-slate-300">|</span>
                        <span title="总 Tokens" className="font-semibold text-slate-700">∑ {(event.usage.input_tokens || 0) + (event.usage.cache_read_input_tokens || 0) + (event.usage.cache_creation_input_tokens || 0) + (event.usage.output_tokens || 0)}</span>
                      </span>
                    ) : null}
                    {event.timestampStr ? (
                      <span className="rounded-md border border-slate-200/60 bg-white/60 px-2 py-0.5 text-[10px] text-slate-500 font-mono shadow-sm">
                        {event.timestampStr}
                      </span>
                    ) : null}
                  </div>
                </summary>
                <div className="mt-3 pl-1">
                  <pre className="ide-scrollbar max-h-64 overflow-auto rounded-lg border border-slate-200 shadow-inner bg-slate-900 p-3 text-[11px] text-slate-100 font-mono tracking-tight">
                    {formatJson(event.raw)}
                  </pre>
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <div className="hidden max-h-[62vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1 lg:block relative shadow-inner">
        <div className="absolute top-0 w-full text-center text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Map</div>
        <div className="h-full flex flex-col gap-[2px] pt-8 pb-2">
          {timeline.slice(0, 300).map((event) => {
            const isError = event.type === "tool_result" && event.isError;
            return (
              <button
                key={`mini_${event.id}`}
                onClick={() => scrollToEvent(event.id)}
                title={isError ? "跳至异常点" : undefined}
                className={`w-full rounded-sm transition-all hover:scale-x-150 relative ${
                  isError 
                    ? "h-[6px] bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] z-10 cursor-pointer hover:bg-rose-600" 
                    : `h-[2px] opacity-40 hover:opacity-100 ${markerStyle(event).split(' ')[0]}`
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
