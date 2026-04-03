import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardOverview, DashboardTimeGranularity } from "../../lib/dashboardTypes";

interface TimeseriesChartProps {
  data: DashboardOverview["timeSeries"];
  granularity: DashboardTimeGranularity;
  onGranularityChange: (g: DashboardTimeGranularity) => void;
}

type SeriesKey = "verify" | "qc";

const GRANULARITY_MODES: Array<{ key: DashboardTimeGranularity; label: string }> = [
  { key: "hour", label: "按小时" },
  { key: "five_hour", label: "按 5 小时" },
  { key: "day", label: "按天" },
];

function parseTimeBlock(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatHourLabel(date: Date): string {
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatXAxis(tickItem: string, granularity: DashboardTimeGranularity): string {
  const date = parseTimeBlock(tickItem);
  if (!date) return tickItem;
  if (granularity === "day") return `${date.getMonth() + 1}-${date.getDate()}`;
  return formatHourLabel(date);
}

function formatTooltipLabel(label: string, granularity: DashboardTimeGranularity): string {
  const date = parseTimeBlock(label);
  if (!date) return label;
  if (granularity === "day") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  if (granularity === "five_hour") {
    const endDate = new Date(date.getTime() + 4 * 60 * 60 * 1000);
    return `${formatHourLabel(date)} ~ ${formatHourLabel(endDate)}`;
  }
  return formatHourLabel(date);
}

export function TimeseriesChart({ data, granularity, onGranularityChange }: TimeseriesChartProps) {
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    verify: true,
    qc: true,
  });

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((left, right) => {
      const leftTime = parseTimeBlock(left.timeBlock)?.getTime() ?? 0;
      const rightTime = parseTimeBlock(right.timeBlock)?.getTime() ?? 0;
      return leftTime - rightTime;
    });
  }, [data]);

  const toggleSeries = (key: SeriesKey) => {
    const nextValue = !visibleSeries[key];
    if (!nextValue && !visibleSeries[key === "verify" ? "qc" : "verify"]) return;
    setVisibleSeries((prev) => ({ ...prev, [key]: nextValue }));
  };

  if (!chartData.length) return null;

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">执行流量趋势</h3>
          <p className="mt-1 text-xs text-slate-500">核实与质检任务吞吐量时间推演</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50/50 p-1">
          {GRANULARITY_MODES.map((mode) => (
            <ModeButton
              key={mode.key}
              active={granularity === mode.key}
              onClick={() => onGranularityChange(mode.key)}
              label={mode.label}
            />
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LegendToggle
          label="核实执行"
          active={visibleSeries.verify}
          colorClass="bg-teal-500"
          onClick={() => toggleSeries("verify")}
        />
        <LegendToggle
          label="质检执行"
          active={visibleSeries.qc}
          colorClass="bg-indigo-500"
          onClick={() => toggleSeries("qc")}
        />
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorVerify" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorQc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="timeBlock"
              tickFormatter={(value) => formatXAxis(value, granularity)}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              }}
              labelFormatter={(label) => formatTooltipLabel(String(label), granularity)}
            />
            {visibleSeries.verify ? (
              <Area type="monotone" name="核实执行" dataKey="verifyCount" stroke="#0d9488" fillOpacity={1} fill="url(#colorVerify)" />
            ) : null}
            {visibleSeries.qc ? (
              <Area type="monotone" name="质检执行" dataKey="qcCount" stroke="#4f46e5" fillOpacity={1} fill="url(#colorQc)" />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { key?: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function LegendToggle({
  label,
  active,
  colorClass,
  onClick,
}: {
  label: string;
  active: boolean;
  colorClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-400"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${colorClass} ${active ? "opacity-100" : "opacity-30"}`} />
      {label}
    </button>
  );
}
