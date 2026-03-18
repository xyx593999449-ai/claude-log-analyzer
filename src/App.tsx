import { useState } from "react";
import { LayoutDashboard, Logs } from "lucide-react";
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
    <div>
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setPage({ kind: "dashboard" })}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${
              page.kind === "dashboard" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" /> 看板首页
          </button>
          <button
            type="button"
            onClick={() => setPage({ kind: "analyzer" })}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${
              page.kind === "analyzer" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Logs className="h-4 w-4" /> 日志分析页
          </button>
        </div>
      </div>

      {page.kind === "dashboard" ? (
        <DashboardHome onOpenLogs={(taskId) => setPage({ kind: "log", taskId })} />
      ) : (
        <LegacyLogAnalyzerPage />
      )}
    </div>
  );
}
