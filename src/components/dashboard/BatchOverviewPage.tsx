import { useEffect, useState, type FC, type ReactNode } from "react";
import { fetchBatches } from "../../lib/dashboardApi";
import type { BatchOverviewItem } from "../../lib/dashboardTypes";
import { Layers, Database, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatNumber } from "./dashboardModel";

export function BatchOverviewPage() {
  const [batches, setBatches] = useState<BatchOverviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchBatches()
      .then(setBatches)
      .catch((err) => setError(err instanceof Error ? err.message : "获取批次失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="text-slate-900 min-h-[calc(100vh-80px)]">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Batch Overview</div>
          <h1 className="mt-2 text-[34px] font-bold tracking-tight text-slate-950">批次概览</h1>
          <p className="mt-2 text-sm text-slate-500">从整体维度宏观浏览并进入各批次的核实与质检流动任务</p>
        </div>

        <Link 
          to="/tasks"
          className="group relative overflow-hidden flex flex-col rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 p-5 shadow-[0_4px_20px_rgba(15,23,42,0.03)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_40px_rgba(79,70,229,0.1)] md:min-w-[320px]"
        >
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-indigo-400/10 blur-2xl"></div>
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-indigo-100 text-indigo-600 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
              <Database className="h-6 w-6" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors flex items-center gap-1.5">
                全局大盘看板 
                <ArrowRight className="h-4 w-4 ml-auto text-indigo-400 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
              </h3>
              <p className="text-xs text-slate-500 mt-1">无视批次隔离，一览全库记录</p>
            </div>
          </div>
        </Link>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700 mb-6 flex items-center gap-3"><AlertCircle className="h-5 w-5" /> {error}</div> : null}

      {loading ? (
        <div className="rounded-[32px] border border-white/60 bg-white/78 p-16 text-center text-sm text-slate-500 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
          <div className="mt-5 font-medium">正在计算批次立体统计引擎...</div>
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/60 p-16 text-center text-sm font-medium text-slate-500 backdrop-blur">
          暂无解析到批次数据
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">

          {batches.map((batch) => (
            <BatchCard key={batch.batchId} batch={batch} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number, isPending?: boolean) {
  if (isPending) return "/";
  if (!ms) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatPercent(rate: number, isPending?: boolean) {
  if (isPending) return "/";
  return (rate * 100).toFixed(1) + '%';
}

function formatDateTime(val: string | null, isPending?: boolean) {
  if (isPending || !val) return "/";
  let normalizedVal = val;
  if (typeof val === 'string' && val.includes(',')) {
    normalizedVal = val.replace(',', '.');
  }
  const num = Number(normalizedVal);
  const d = new Date(isNaN(num) ? normalizedVal : num);
  if (isNaN(d.getTime())) return "/";
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function StatBox({ icon, title, value, valueClass = "text-slate-800" }: { icon?: ReactNode, title: string, value: ReactNode, valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/60 p-4 transition-colors hover:bg-white shadow-sm shadow-slate-200/20">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className={`mt-1.5 font-mono text-[26px] font-bold tracking-tight truncate ${valueClass}`}>{value}</div>
    </div>
  );
}

const BatchCard: FC<{ batch: BatchOverviewItem }> = ({ batch }) => {
  const isPending = batch.status === "pending";
  const anomalyRate = batch.taskCount > 0 ? batch.anomalyCount / batch.taskCount : 0;
  const showWarning = anomalyRate > 0.1 || batch.qcRejectedCount > 0;

  // 用时超限逻辑：单条 5min * 任务数 * 2 (含一倍 buffer)
  const durationThresholdMs = batch.taskCount * 5 * 60 * 1000 * 2;
  const isOvertime = !isPending && (batch.totalDurationMs > durationThresholdMs);
  const durationValueClass = isPending ? "text-slate-400" : (isOvertime ? "text-rose-600" : "text-emerald-600");

  // 根据生命周期 status 决定主色调
  let cardBorder = "border-white/70";
  let iconStyle = "border-slate-200 bg-slate-50 text-slate-500"; // pending
  if (batch.status === "running") {
    iconStyle = "border-blue-200 bg-blue-50 text-blue-500";
    cardBorder = "border-blue-100/50";
  } else if (batch.status === "completed") {
    iconStyle = "border-emerald-200 bg-emerald-50 text-emerald-500";
    cardBorder = "border-emerald-100/50";
  }

  return (
    <article className={`group flex flex-col relative overflow-hidden rounded-[32px] border bg-white/90 p-7 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_80px_rgba(15,23,42,0.1)] backdrop-blur-xl ${cardBorder}`}>
      <div className="absolute top-0 right-0 flex max-w-[70%] flex-wrap justify-end gap-2 p-4 z-10">
        {batch.status === "pending" && <span className="rounded-xl bg-slate-100/90 px-3 py-1.5 text-xs font-bold text-slate-600 backdrop-blur-sm shadow-sm ring-1 ring-slate-200/50">待处理</span>}
        {batch.status === "running" && <span className="rounded-xl bg-blue-100/90 px-3 py-1.5 text-xs font-bold text-blue-800 backdrop-blur-sm shadow-sm ring-1 ring-blue-200/50">进行中</span>}
        {batch.status === "completed" && <span className="rounded-xl bg-emerald-100/90 px-3 py-1.5 text-xs font-bold text-emerald-800 backdrop-blur-sm shadow-sm ring-1 ring-emerald-200/50">已完成</span>}
        
        {showWarning && (
           <span className="flex items-center gap-1 rounded-xl bg-amber-100/90 px-3 py-1.5 text-xs font-bold text-amber-800 backdrop-blur-sm shadow-sm ring-1 ring-amber-200/50">
             <AlertCircle className="h-3.5 w-3.5" /> 需关注
           </span>
        )}
      </div>
      
      <div className="flex items-start gap-4">
        <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${iconStyle}`}>
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 pr-20">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">批次号</div>
          <h3 className="mt-1 truncate text-lg font-semibold text-slate-900" title={batch.batchId}>{batch.batchId}</h3>
        </div>
      </div>

      <div className="mt-6 flex-1">
        <div className="grid grid-cols-2 gap-3">
          <StatBox icon={<Database className="h-3 w-3" />} title="总任务量" value={formatNumber(batch.taskCount)} />
          <StatBox title="总用时" value={formatDuration(batch.totalDurationMs, isPending)} valueClass={durationValueClass} />
          <StatBox title="自动化率" value={formatPercent(batch.automationRate, isPending)} />
          <StatBox title="质检合格率" value={formatPercent(batch.qcPassRate, isPending)} valueClass={isPending ? "text-slate-400" : (batch.qcPassRate < 0.9 ? "text-rose-600" : "text-emerald-600")} />
        </div>

        <div className="mt-8 space-y-4 text-[13px] text-slate-500">
          <div className="flex justify-between border-b border-slate-100/60 pb-3">
            <span>总 Token 消耗</span>
            <span className="font-mono text-sm font-semibold text-slate-700">{isPending ? "/" : formatNumber(batch.totalTokens)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100/60 pb-3">
            <span>批次创建时间</span>
            <span className="font-mono text-[13px] font-medium text-slate-600">{formatDateTime(batch.createdAt, isPending)}</span>
          </div>
          <div className="flex justify-between">
            <span>完成时间</span>
            <span className="font-mono text-[13px] font-medium text-slate-600">{formatDateTime(batch.completedAt, isPending)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400">
          独立查看此批次详情
        </div>
        <Link 
          to={`/tasks?batch=${encodeURIComponent(batch.batchId)}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)] transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_14px_24px_rgba(15,23,42,0.2)]"
        >
          查看批次 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
