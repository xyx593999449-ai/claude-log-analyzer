import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Coins, FileText, Info, UploadCloud, X } from "lucide-react";
import type { DashboardOverview } from "../../lib/dashboardTypes";
import {
  GLM_PRICE_INPUT,
  GLM_PRICE_OUTPUT,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
  getStatusClasses,
  mergeUploads,
  normalizeUploaded,
  type AlertTone,
  type UploadItem,
  type UploadPhase,
  type UploadRole,
} from "./dashboardModel";

const COST_TOOLTIP = `按 GLM 价格估算：输入 ${GLM_PRICE_INPUT} 元/百万 Token，输出 ${GLM_PRICE_OUTPUT} 元/百万 Token。平均成本 = 总成本 / 任务数。`;

export function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.26em] text-slate-400">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p> : null}
    </div>
  );
}

export function ChartPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_25px_80px_rgba(15,23,42,0.06)] backdrop-blur">
      <SectionIntro eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-5">{children}</div>
    </article>
  );
}

export function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 text-sm text-slate-500">
      {label}
    </div>
  );
}

export function SpotlightCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description?: string;
  tone: AlertTone;
}) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/80"
      : tone === "info"
        ? "border-cyan-200 bg-cyan-50/80"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50/80"
          : "border-slate-200 bg-slate-50/80";

  return (
    <article className={`rounded-[24px] border p-4 ${toneClasses}`}>
      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
    </article>
  );
}

export function AttentionRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: AlertTone;
}) {
  const dotClass =
    tone === "success"
      ? "bg-emerald-400"
      : tone === "info"
        ? "bg-sky-400"
        : tone === "warning"
          ? "bg-amber-400"
          : tone === "danger"
            ? "bg-rose-400"
            : "bg-slate-400";

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start gap-3">
        <span className={`mt-2 h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="text-xs text-slate-400">{detail}</div>
        </div>
      </div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export function ExecutionCard({
  title,
  metrics,
  tone,
}: {
  title: string;
  metrics: DashboardOverview["verifyMetrics"] | undefined;
  tone: "verify" | "qc";
}) {
  const theme =
    tone === "verify"
      ? {
          ring: "border-teal-200 bg-teal-50/80",
          accent: "bg-teal-950 text-white",
          label: "自动化率",
          value: formatPercent(metrics?.automationRate ?? 0),
        }
      : {
          ring: "border-sky-200 bg-sky-50/80",
          accent: "bg-sky-950 text-white",
          label: "核实质量",
          value: formatPercent(metrics?.verificationQualityRate ?? 0),
        };

  return (
    <article className={`rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] ${theme.ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{formatNumber(metrics?.taskCount ?? 0)} 条</div>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-right shadow-[0_10px_24px_rgba(15,23,42,0.14)] ${theme.accent}`}>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">{theme.label}</div>
          <div className="mt-1 text-2xl font-semibold">{theme.value}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricChip label="总耗时" value={formatDuration(metrics?.totalDurationMs ?? 0)} />
        <MetricChip label="平均耗时" value={formatDuration(metrics?.avgDurationMs ?? 0)} />
        <MetricChip label="总 Token" value={formatNumber(metrics?.totalTokens ?? 0)} />
        <MetricChip label="平均 Token" value={formatNumber(metrics?.avgTotalTokens ?? 0)} />
        <MetricChip label="平均输入 Token" value={formatNumber(metrics?.avgInputTokens ?? 0)} />
        <MetricChip label="平均输出 Token" value={formatNumber(metrics?.avgOutputTokens ?? 0)} />
        <MetricChip label="总成本" value={formatCost(metrics?.totalCostUsd ?? 0)} tooltip={COST_TOOLTIP} icon={<Coins className="h-3.5 w-3.5 text-slate-400" />} />
        <MetricChip label="平均成本" value={formatCost(metrics?.avgCostUsd ?? 0)} tooltip={COST_TOOLTIP} icon={<Coins className="h-3.5 w-3.5 text-slate-400" />} />
      </div>
    </article>
  );
}

function MetricChip({
  label,
  value,
  tooltip,
  icon,
}: {
  label: string;
  value: string;
  tooltip?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="group relative rounded-2xl border border-white/80 bg-white/82 px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
        {icon}
        <span>{label}</span>
        {tooltip ? <Info className="h-3.5 w-3.5 text-slate-400" /> : null}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>

      {tooltip ? (
        <div className="pointer-events-none absolute left-4 top-full z-20 mt-2 hidden w-64 rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 text-[11px] leading-5 text-slate-100 shadow-[0_18px_40px_rgba(15,23,42,0.24)] group-hover:block">
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}

export function MiniKpiCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description?: string;
  tone: AlertTone;
}) {
  return (
    <article className={`rounded-3xl border p-4 ${getStatusClasses(tone)}`}>
      <div className="text-xs uppercase tracking-[0.24em] opacity-75">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {description ? <p className="mt-2 text-xs leading-6 opacity-80">{description}</p> : null}
    </article>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  key?: string | number;
  label: string;
  tone: AlertTone;
}) {
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${getStatusClasses(tone)}`}>{label}</span>;
}

export function InfoBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
      {icon}
      {label}
    </span>
  );
}

export function MetaRow({
  label,
  value,
  clamp = true,
}: {
  label: string;
  value: string;
  clamp?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className={`${clamp ? "line-clamp-2" : ""} leading-6 text-slate-700`}>{value}</div>
    </div>
  );
}

export function UploadZone({
  title,
  phase,
  items,
  onChange,
}: {
  title: string;
  phase: UploadPhase;
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function appendFiles(files: FileList | File[] | null): void {
    const nextItems = normalizeUploaded(files);
    onChange(mergeUploads(items, nextItems));
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
            <UploadCloud className="h-4 w-4 text-teal-700" />
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-500">{phase === "verify" ? "核实阶段" : "质检阶段"}</div>
        </div>
        <button
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          选择文件
        </button>
      </div>

      <div
        className={`rounded-3xl border border-dashed px-4 py-6 text-sm transition ${
          dragging ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-300 bg-white/80 text-slate-500"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          appendFiles(e.dataTransfer.files);
        }}
      >
        拖拽文件到这里，或点击上方选择文件
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => appendFiles(e.target.files)}
      />

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-xs text-slate-400">
            暂无已选文件
          </div>
        ) : (
          items.map((item) => (
            <UploadItemRow key={item.id} item={item} items={items} onChange={onChange} />
          ))
        )}
      </div>
    </div>
  );
}

function UploadItemRow({
  item,
  items,
  onChange,
}: {
  key?: string | number;
  item: UploadItem;
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
      <FileText className="h-4 w-4 text-slate-400" />
      <span className="min-w-0 flex-1 truncate" title={item.file.name}>
        {item.file.name}
      </span>
      <select
        value={item.role}
        onChange={(e) => {
          const role = e.target.value as UploadRole;
          onChange(items.map((current) => (current.id === item.id ? { ...current, role } : current)));
        }}
        className="rounded-xl border border-slate-300 bg-slate-50 px-2 py-1.5"
      >
        <option value="unknown">自动识别</option>
        <option value="executor">执行日志</option>
        <option value="claude">Claude 日志</option>
      </select>
      <button
        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"
        type="button"
        onClick={() => onChange(items.filter((current) => current.id !== item.id))}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
