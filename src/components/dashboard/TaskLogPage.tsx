import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchTaskLogs } from "../../lib/dashboardApi";
import type { TaskLogDetail } from "../../lib/dashboardTypes";
import { AnalysisLayout } from "../legacy/AnalysisLayout";
import { LegacyLogViewer } from "../legacy/LegacyLogViewer";

interface TaskLogPageProps {
  taskId: string;
  onBack: () => void;
}

export function TaskLogPage({ taskId, onBack }: TaskLogPageProps) {
  const [detail, setDetail] = useState<TaskLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    fetchTaskLogs(taskId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
    <AnalysisLayout
      title="任务日志详情"
      subtitle={`task_id: ${taskId}`}
      actions={
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </button>
      }
    >
      {loading ? <div className="text-sm text-zinc-500">日志加载中...</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {!loading && !error ? (
        <>
          <LegacyLogViewer title="核实日志（Claude）" rawLog={detail?.verifyRawLog ?? ""} />
          <LegacyLogViewer title="质检日志（Claude）" rawLog={detail?.qcRawLog ?? ""} />
        </>
      ) : null}
    </AnalysisLayout>
  );
}

