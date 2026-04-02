import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardOverview } from "../../lib/dashboardTypes";

interface TimeseriesChartProps {
  data: DashboardOverview["timeSeries"];
  granularity: "day" | "hour";
  onGranularityChange: (g: "day" | "hour") => void;
}

function formatXAxis(tickItem: string, granularity: "day" | "hour") {
  if (!tickItem) return "";
  const d = new Date(tickItem.replace(" ", "T"));
  if (isNaN(d.getTime())) return tickItem;
  
  if (granularity === "day") {
    return `${d.getMonth() + 1}-${d.getDate()}`;
  }
  return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:00`;
}

export function TimeseriesChart({ data, granularity, onGranularityChange }: TimeseriesChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.sort((a, b) => new Date(a.timeBlock.replace(" ", "T")).getTime() - new Date(b.timeBlock.replace(" ", "T")).getTime());
  }, [data]);

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">执行流量趋势</h3>
          <p className="mt-1 text-xs text-slate-500">核实与质检任务吞吐量时间推演</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50/50 p-1">
          <ModeButton active={granularity === "hour"} onClick={() => onGranularityChange("hour")} label="按小时" />
          <ModeButton active={granularity === "day"} onClick={() => onGranularityChange("day")} label="按天" />
        </div>
      </div>
      
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorVerify" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorQc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="timeBlock" 
              tickFormatter={(val) => formatXAxis(val, granularity)} 
              tick={{ fontSize: 11, fill: '#64748b' }} 
              axisLine={false} 
              tickLine={false} 
              dy={10} 
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#64748b' }} 
              axisLine={false} 
              tickLine={false} 
            />
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
              labelFormatter={(label) => formatXAxis(label as string, granularity)}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            <Area type="monotone" name="核实执行" dataKey="verifyCount" stroke="#0d9488" fillOpacity={1} fill="url(#colorVerify)" />
            <Area type="monotone" name="质检执行" dataKey="qcCount" stroke="#4f46e5" fillOpacity={1} fill="url(#colorQc)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
        active 
          ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/50" 
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}
