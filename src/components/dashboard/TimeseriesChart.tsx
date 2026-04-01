import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardOverview } from "../../lib/dashboardTypes";

interface TimeseriesChartProps {
  data: DashboardOverview["timeSeries"];
}

type GroupMode = "1h" | "5h" | "1d";

function formatXAxis(tickItem: string, mode: GroupMode) {
  if (!tickItem) return "";
  // Assuming tickItem is a valid timestamp or at least convertible to Date
  const d = new Date(tickItem);
  if (isNaN(d.getTime())) {
    // try to fallback parsing 'YYYY-MM-DD HH:00:00' if not ISO
    return tickItem.split(" ")[0] ?? tickItem;
  }
  if (mode === "1d") {
    return `${d.getMonth() + 1}-${d.getDate()}`;
  }
  return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:00`;
}

export function TimeseriesChart({ data }: TimeseriesChartProps) {
  const [mode, setMode] = useState<GroupMode>("1h");

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Grouping
    const grouped = new Map<string, { timeBlock: string; verifyCount: number; qcCount: number; ts: number }>();
    
    for (const item of data) {
      if (!item.timeBlock) continue;
      
      let ts = new Date(item.timeBlock).getTime();
      if (isNaN(ts)) {
         // handle SQLite formats like '2024-05-18 10:00:00Z'
         const mod = item.timeBlock.replace(" ", "T");
         ts = new Date(mod).getTime();
      }

      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;

      let key = item.timeBlock;
      let displayTime = item.timeBlock;

      if (mode === "1h") {
        key = item.timeBlock;
        displayTime = item.timeBlock;
      } else if (mode === "5h") {
        const hourStr = d.getHours().toString();
        const hour = parseInt(hourStr, 10);
        const chunk = Math.floor(hour / 5) * 5;
        const chunkStr = chunk.toString().padStart(2, "0");
        const datePart = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
        key = `${datePart}T${chunkStr}:00:00`;
        displayTime = key;
      } else if (mode === "1d") {
        const datePart = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
        key = `${datePart}T00:00:00`;
        displayTime = key;
      }
      
      const existing = grouped.get(key);
      if (existing) {
        existing.verifyCount += item.verifyCount;
        existing.qcCount += item.qcCount;
      } else {
        grouped.set(key, {
          timeBlock: displayTime,
          verifyCount: item.verifyCount,
          qcCount: item.qcCount,
          ts: d.getTime(), // we use d.getTime() for sorting
        });
      }
    }
    
    return Array.from(grouped.values()).sort((a, b) => a.ts - b.ts);
  }, [data, mode]);

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">执行流量趋势</h3>
          <p className="mt-1 text-xs text-slate-500">核实与质检任务吞吐量时间推演</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50/50 p-1">
          <ModeButton active={mode === "1h"} onClick={() => setMode("1h")} label="按小时" />
          <ModeButton active={mode === "5h"} onClick={() => setMode("5h")} label="按5小时" />
          <ModeButton active={mode === "1d"} onClick={() => setMode("1d")} label="按天" />
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
              tickFormatter={(val) => formatXAxis(val, mode)} 
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
              labelFormatter={(label) => formatXAxis(label as string, mode)}
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
