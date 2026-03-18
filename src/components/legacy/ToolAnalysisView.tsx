import type { LogStats } from "../../lib/types";

export function ToolAnalysisView({ stats }: { stats: LogStats }) {
  const rows = Object.entries(stats.toolCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([name, count]) => ({
      name,
      count,
      error: stats.toolErrors[name] ?? 0,
    }));

  return (
    <div className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
      {rows.length === 0 ? <div className="text-xs text-slate-400">暂无工具调用</div> : null}
      <div className="space-y-2 text-xs">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="font-medium text-slate-700">{row.name}</div>
            <div className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              调用 {row.count} / 错误 {row.error}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

