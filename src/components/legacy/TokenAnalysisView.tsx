import type { LogStats } from "../../lib/types";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function TokenAnalysisView({ stats }: { stats: LogStats }) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs md:grid-cols-2">
      <MetricCard label="总 Token" value={formatNumber(stats.inputTokens + stats.outputTokens)} className="border-indigo-200 bg-indigo-50" />
      <MetricCard label="输入 Token" value={formatNumber(stats.inputTokens)} className="border-sky-200 bg-sky-50" />
      <MetricCard label="输出 Token" value={formatNumber(stats.outputTokens)} className="border-amber-200 bg-amber-50" />
      <MetricCard label="Cache Token" value={formatNumber(stats.cacheTokens)} className="border-emerald-200 bg-emerald-50" />
      <MetricCard label="原始日志成本" value={formatCost(stats.totalCost)} className="border-violet-200 bg-violet-50 md:col-span-2" />
    </div>
  );
}

function MetricCard({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-sm ${className}`}>
      <div className="mb-0.5 text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  );
}
