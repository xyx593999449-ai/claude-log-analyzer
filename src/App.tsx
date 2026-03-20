import { useState } from "react";
import type { ReactNode } from "react";
import { LayoutDashboard, Logs, Waypoints } from "lucide-react";
import { DashboardHome } from "./components/dashboard/DashboardHome";
import { LegacyLogAnalyzerPage } from "./components/dashboard/LegacyLogAnalyzerPage";
import { TaskLogPage } from "./components/dashboard/TaskLogPage";

type PageState =
  | { kind: "dashboard" }
  | { kind: "analyzer" }
  | { kind: "log"; taskId: string };

export default function App() {
  const [page, setPage] = useState<PageState>({ kind: "dashboard" });

  if (page.kind === "log") {
    return <TaskLogPage taskId={page.taskId} onBack={() => setPage({ kind: "dashboard" })} />;
  }

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

          <div className="flex flex-wrap gap-2">
            <NavButton
              active={page.kind === "dashboard"}
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="主看板"
              onClick={() => setPage({ kind: "dashboard" })}
            />
            <NavButton
              active={page.kind === "analyzer"}
              icon={<Logs className="h-4 w-4" />}
              label="日志分析"
              onClick={() => setPage({ kind: "analyzer" })}
            />
          </div>
        </div>
      </header>

      {page.kind === "dashboard" ? (
        <DashboardHome onOpenLogs={(taskId) => setPage({ kind: "log", taskId })} />
      ) : (
        <LegacyLogAnalyzerPage />
      )}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
          : "border border-slate-300 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:bg-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
