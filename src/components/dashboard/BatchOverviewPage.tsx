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
    <div className="text-slate-900">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Batch Overview</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">批次概览</h1>
        <p className="mt-2 text-sm text-slate-600">从整体维度浏览并进入各批次的核实与质检任务</p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-6">{error}</div> : null}

      {loading ? (
        <div className="rounded-[32px] border border-white/60 bg-white/78 p-12 text-center text-sm text-slate-500 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600"></div>
          <div className="mt-4">正在计算批次统计...</div>
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/60 p-12 text-center text-sm text-slate-500 backdrop-blur">
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

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatPercent(rate: number) {
  return (rate * 100).toFixed(1) + '%';
}

function formatDateTime(val: string | null) {
  if (!val) return "-";
  let normalizedVal = val;
  if (typeof val === 'string' && val.includes(',')) {
    normalizedVal = val.replace(',', '.');
  }
  const num = Number(normalizedVal);
  const d = new Date(isNaN(num) ? normalizedVal : num);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function StatBox({ icon, title, value, valueClass = "text-slate-800" }: { icon?: ReactNode, title: string, value: ReactNode, valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-white bg-slate-50/50 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className={`mt-1 text-2xl font-semibold truncate ${valueClass}`}>{value}</div>
    </div>
  );
}

const BatchCard: FC<{ batch: BatchOverviewItem }> = ({ batch }) => {
  const anomalyRate = batch.taskCount > 0 ? batch.anomalyCount / batch.taskCount : 0;
  const showWarning = anomalyRate > 0.1 || batch.qcRejectedCount > 0;

  return (
    <article className={`group flex flex-col relative overflow-hidden rounded-[28px] border bg-white/84 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur ${showWarning ? "border-amber-200" : "border-white/70"}`}>
      <div className="absolute top-0 right-0 flex max-w-[70%] flex-wrap justify-end gap-1.5 p-3">
        {batch.status === "pending" && <span className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">待处理</span>}
        {batch.status === "running" && <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-600">进行中</span>}
        {batch.status === "completed" && <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-600">已完成</span>}
        
        {showWarning && (
           <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">需关注</span>
        )}
      </div>
      
      <div className="flex items-start gap-4">
        <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${showWarning ? "border-amber-200 bg-amber-50 text-amber-600" : "border-teal-200 bg-teal-50 text-teal-600"}`}>
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
          <StatBox title="总用时" value={formatDuration(batch.totalDurationMs)} />
          <StatBox title="自动化率" value={formatPercent(batch.automationRate)} />
          <StatBox title="质检合格率" value={formatPercent(batch.qcPassRate)} valueClass={batch.qcPassRate < 0.9 ? "text-rose-600" : "text-emerald-600"} />
        </div>

        <div className="mt-5 space-y-2.5 text-[13px] text-slate-500">
          <div className="flex justify-between border-b border-slate-100 pb-2.5">
            <span>总 Token 消耗</span>
            <span className="font-medium text-slate-700">{formatNumber(batch.totalTokens)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2.5">
            <span>批次创建时间</span>
            <span className="font-medium text-slate-700">{formatDateTime(batch.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>完成时间</span>
            <span className="font-medium text-slate-700">{formatDateTime(batch.completedAt)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-200/60 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          独立查看此批次详情
        </div>
        <Link 
          to={`/tasks?batch=${encodeURIComponent(batch.batchId)}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(15,23,42,0.2)]"
        >
          查看批次 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
