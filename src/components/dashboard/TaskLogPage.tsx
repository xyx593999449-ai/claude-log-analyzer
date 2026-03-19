import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, FileSearch, ShieldCheck, ShieldUser } from "lucide-react";
import { fetchTaskLogs } from "../../lib/dashboardApi";
import type { TaskLogDetail } from "../../lib/dashboardTypes";
import { AnalysisLayout } from "../legacy/AnalysisLayout";
import { LegacyLogViewer } from "../legacy/LegacyLogViewer";

interface TaskLogPageProps {
  taskId: string;
  onBack: () => void;
}

type PhaseTab = "verify" | "qc";

export function TaskLogPage({ taskId, onBack }: TaskLogPageProps) {
  const [detail, setDetail] = useState<TaskLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<PhaseTab>("verify");

  useEffect(() => {
    setLoading(true);
    setError("");

    fetchTaskLogs(taskId)
      .then((result) => {
        setDetail(result);
        const hasVerify = Boolean(result.verifyRawLog?.trim());
        const hasQc = Boolean(result.qcRawLog?.trim());
        setPhase(!hasVerify && hasQc ? "qc" : "verify");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [taskId]);

  const verifyAvailable = Boolean(detail?.verifyRawLog?.trim());
  const qcAvailable = Boolean(detail?.qcRawLog?.trim());

  const currentPhaseConfig = useMemo(() => {
    if (phase === "verify") {
      return {
        title: "核实日志",
        rawLog: detail?.verifyRawLog ?? "",
        sessionIds: detail?.verifySessionIds ?? [],
      };
    }
    return {
      title: "质检日志",
      rawLog: detail?.qcRawLog ?? "",
      sessionIds: detail?.qcSessionIds ?? [],
    };
  }, [detail, phase]);

  return (
    <AnalysisLayout
      title="任务日志"
      subtitle={`task_id: ${taskId}`}
      actions={
        <button
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </button>
      }
    >
      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white/84 p-5 text-sm text-slate-500 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          日志加载中...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <section className="rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Task Overview</div>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">日志总览</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge icon={<FileSearch className="h-3.5 w-3.5" />} label={`task_id ${taskId}`} />
                  <Badge icon={<ShieldCheck className="h-3.5 w-3.5" />} label={`核实 session ${detail?.verifySessionIds.length ?? 0}`} />
                  <Badge icon={<ShieldUser className="h-3.5 w-3.5" />} label={`质检 session ${detail?.qcSessionIds.length ?? 0}`} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  title="核实日志"
                  value={verifyAvailable ? "已就绪" : "暂无日志"}
                  description={verifyAvailable ? `${detail?.verifySessionIds.length ?? 0} 个 session` : "未导入"}
                  tone={verifyAvailable ? "success" : "neutral"}
                />
                <SummaryCard
                  title="质检日志"
                  value={qcAvailable ? "已就绪" : "暂无日志"}
                  description={qcAvailable ? `${detail?.qcSessionIds.length ?? 0} 个 session` : "未导入"}
                  tone={qcAvailable ? "success" : "neutral"}
                />
                <SummaryCard
                  title="当前阶段"
                  value={phase === "verify" ? "核实阶段" : "质检阶段"}
                  description={phase === "verify" ? `${detail?.verifySessionIds.length ?? 0} 个 session` : `${detail?.qcSessionIds.length ?? 0} 个 session`}
                  tone="info"
                />
                <SummaryCard
                  title="日志状态"
                  value={verifyAvailable || qcAvailable ? "可分析" : "待补充"}
                  description={verifyAvailable || qcAvailable ? "已发现原始日志" : "暂无原始日志"}
                  tone={verifyAvailable || qcAvailable ? "success" : "warning"}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Phase Switch</div>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">阶段切换</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <PhaseButton
                  active={phase === "verify"}
                  disabled={!verifyAvailable}
                  label="核实阶段"
                  description={`${detail?.verifySessionIds.length ?? 0} 个 session`}
                  onClick={() => setPhase("verify")}
                />
                <PhaseButton
                  active={phase === "qc"}
                  disabled={!qcAvailable}
                  label="质检阶段"
                  description={`${detail?.qcSessionIds.length ?? 0} 个 session`}
                  onClick={() => setPhase("qc")}
                />
              </div>
            </div>
          </section>

          <LegacyLogViewer
            title={currentPhaseConfig.title}
            rawLog={currentPhaseConfig.rawLog}
            sessionIds={currentPhaseConfig.sessionIds}
          />
        </>
      ) : null}
    </AnalysisLayout>
  );
}

function Badge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
      {icon}
      {label}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: "success" | "neutral" | "info" | "warning";
}) {
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/80"
      : tone === "info"
        ? "border-cyan-200 bg-cyan-50/80"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50/80"
          : "border-slate-200 bg-slate-50/80";

  return (
    <article className={`rounded-3xl border p-4 ${classes}`}>
      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function PhaseButton({
  active,
  disabled,
  label,
  description,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
        {disabled ? "当前无日志" : description}
      </div>
    </button>
  );
}
