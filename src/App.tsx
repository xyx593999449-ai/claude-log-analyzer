import type { ReactNode } from "react";
import { Routes, Route, NavLink, Navigate, Outlet } from "react-router-dom";
import { LayoutDashboard, Logs, Waypoints, ListTree, Database, Server } from "lucide-react";
import { DashboardHome } from "./components/dashboard/DashboardHome";
import { LegacyLogAnalyzerPage } from "./components/dashboard/LegacyLogAnalyzerPage";
import { TaskLogPage } from "./components/dashboard/TaskLogPage";
import { BatchOverviewPage } from "./components/dashboard/BatchOverviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/batches" replace />} />
        <Route path="batches" element={<BatchOverviewPage />} />
        <Route path="tasks" element={<DashboardHome />} />
        <Route path="logs/:taskId" element={<TaskLogPage />} />
        <Route path="analyzer" element={<LegacyLogAnalyzerPage />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-[rgba(246,242,234,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)]">
              <Waypoints className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Claude Log Analyzer</div>
              <div className="mt-1 font-display text-2xl font-semibold text-slate-950">大poi核实数字员工</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NavButton to="/batches" icon={<ListTree className="h-4 w-4" />} label="批次概览" />
            <NavButton to="/tasks" icon={<LayoutDashboard className="h-4 w-4" />} label="主看板" />
            <NavButton to="/analyzer" icon={<Logs className="h-4 w-4" />} label="日志分析" />
            <div className="flex items-center ml-2 pl-4 border-l border-slate-300">
              <button 
                onClick={() => {
                  const current = localStorage.getItem("dashboard_db_client") || "sqlite";
                  localStorage.setItem("dashboard_db_client", current === "sqlite" ? "pg" : "sqlite");
                  window.location.reload();
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                title="切换数据源"
              >
                {localStorage.getItem("dashboard_db_client") === "pg" ? (
                  <><Server className="w-3.5 h-3.5 text-indigo-600"/> PG库 (真实)</>
                ) : (
                  <><Database className="w-3.5 h-3.5 text-orange-500"/> SQLite (Mock)</>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavButton({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
          isActive
            ? "bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
            : "border border-slate-300 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:bg-white"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
