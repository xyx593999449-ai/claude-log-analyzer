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
      <MetricCard label="总 Token" value={formatNumber(stats.inputTokens + stats.outputTokens)} className="bg-indigo-50 border-indigo-200" />
      <MetricCard label="输入 Token" value={formatNumber(stats.inputTokens)} className="bg-sky-50 border-sky-200" />
      <MetricCard label="输出 Token" value={formatNumber(stats.outputTokens)} className="bg-amber-50 border-amber-200" />
      <MetricCard label="Cache Token" value={formatNumber(stats.cacheTokens)} className="bg-emerald-50 border-emerald-200" />
      <MetricCard label="日志成本(原始)" value={formatCost(stats.totalCost)} className="bg-violet-50 border-violet-200 md:col-span-2" />
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

