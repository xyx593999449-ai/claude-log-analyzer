import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSearch,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Workflow,
} from "lucide-react";
import type { DashboardTaskItem, RunView } from "../../lib/dashboardTypes";
import {
  buildAlerts,
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
  getProcessStage,
  getStageIndex,
  getStageTone,
  PROCESS_STAGES,
  type AlertTone,
  type ProcessStageKey,
} from "./dashboardModel";
import { InfoBadge, StatusPill } from "./dashboardWidgets";

type PhaseKey = "verify" | "qc";

interface EvidenceSourceTag {
  sourceName: string;
  count: number;
}

interface EvidenceSummary {
  total: number;
  sources: EvidenceSourceTag[];
}

interface PhaseModuleMeta {
  phase: PhaseKey;
  eyebrow: string;
  title: string;
  badgeLabel: string;
  badgeTone: AlertTone;
  conclusionValue: string;
  summaryLabel: string;
  summaryValue: string;
  timestampLabel: string;
  timestampValue: string;
  run: RunView | null;
  databaseStatusLabel: string;
  databaseStatusValue: string;
  scoreLabel: string;
  scoreValue: string;
  errorSummary: string | null;
}

export function TaskFlowCard({
  item,
  index,
  onOpenLogs,
}: {
  key?: string | number;
  item: DashboardTaskItem;
  index: number;
  onOpenLogs: (taskId: string) => void;
}) {
  const stage = getProcessStage(item);
  const alerts = buildAlerts(item);
  const evidenceSummary = extractEvidenceSummary(item);
  const verifyModule = buildPhaseModuleMeta(item, "verify");
  const qcModule = buildPhaseModuleMeta(item, "qc");
  const hasCritical = alerts.some((alert) => alert.tone === "danger");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);

  return (
    <article
      className={`reveal-card rounded-[30px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] ${
        hasCritical ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white/88"
      }`}
      style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Task
            </span>
            <span className="text-sm font-semibold text-slate-900">{item.taskId}</span>
            <StatusPill label={stage.label} tone={getStageTone(stage.key)} />
          </div>

          <div>
            <h3 className="text-2xl font-semibold text-slate-950">{item.name ?? "未命名任务"}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {item.city ?? "未知城市"} / {item.poiType ?? "未知类型"} / POI_ID {item.poiId ?? "-"}
            </p>
            {item.address ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{item.address}</p> : null}
          </div>

          {evidenceSummary ? <EvidenceSummaryRow summary={evidenceSummary} /> : null}

          <div className="flex flex-wrap gap-2">
            {alerts.slice(0, 4).map((alert, alertIndex) => (
              <AlertChip key={`${alert.label}_${alertIndex}`} label={alert.label} detail={alert.detail} tone={alert.tone} />
            ))}
            {alerts.length === 0 ? <StatusPill label="流程稳定" tone="success" /> : null}
          </div>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-slate-50/80 p-4 xl:w-[320px]">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">当前判断</div>
          <div className="mt-3 flex items-start gap-3">
            <div className="rounded-2xl bg-slate-950 p-2 text-white">
              <Workflow className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-950">{stage.label}</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">{stage.description}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <InfoBadge icon={<Bot className="h-3.5 w-3.5" />} label={`核实结论 ${item.verifyResult ?? "-"}`} />
            <InfoBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label={`质检状态 ${item.qualityStatus ?? item.qcStatus ?? "-"}`} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center xl:justify-start">
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {detailsOpen ? "收起更多信息" : "展开更多信息"}
        </button>
      </div>

      {detailsOpen ? (
        <div className="mt-5 space-y-4">
          <ProcessRail currentStage={stage.key} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="space-y-4">
              <PhasePanel module={verifyModule} expanded={modulesOpen} onToggle={() => setModulesOpen((value) => !value)} />
              <PhasePanel module={qcModule} expanded={modulesOpen} onToggle={() => setModulesOpen((value) => !value)} />
            </div>

            <div className="space-y-4">
              <aside className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">异常与风险</div>
                <div className="mt-3 space-y-3">
                  {alerts.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      未发现异常
                    </div>
                  ) : (
                    alerts.map((alert, alertIndex) => (
                      <div key={`${alert.label}_${alertIndex}`} className={`rounded-2xl border px-4 py-3 ${getAlertClasses(alert.tone)}`}>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {alert.tone === "danger" ? (
                            <ShieldX className="h-4 w-4" />
                          ) : alert.tone === "warning" ? (
                            <ShieldAlert className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                          {alert.label}
                        </div>
                        <p className="mt-2 text-xs leading-6 opacity-90">{alert.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </aside>

              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:brightness-110"
                onClick={() => onOpenLogs(item.taskId)}
              >
                <FileSearch className="h-4 w-4" />
                查看日志详情
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PhasePanel({
  module,
  expanded,
  onToggle,
}: {
  module: PhaseModuleMeta;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{module.eyebrow}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h4 className="text-2xl font-semibold text-slate-950">{module.title}</h4>
            <StatusPill label={module.badgeLabel} tone={module.badgeTone} />
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
          aria-label={expanded ? "收起模块详情" : "展开模块详情"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <MetricCard label="当前结论" value={module.conclusionValue} />
        <MetricCard label={module.summaryLabel} value={module.summaryValue} clamp={false} />
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label={module.timestampLabel} value={module.timestampValue} />
          <MetricCard label={module.scoreLabel} value={module.scoreValue} />
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="执行状态" value={module.run?.status ?? "-"} />
            <MetricCard label="开始时间" value={formatDateTime(module.run?.startedAt)} />
            <MetricCard label="结束时间" value={formatDateTime(module.run?.endedAt)} />
            <MetricCard label="耗时" value={formatDuration(module.run?.durationMs ?? 0)} />
            <MetricCard label="重试次数" value={formatNumber(module.run?.retryCount ?? 0)} />
            <MetricCard label="会话数" value={formatNumber(module.run?.sessionCount ?? 0)} />
            <MetricCard label="输入 Token" value={formatNumber(module.run?.inputTokens ?? 0)} />
            <MetricCard label="输出 Token" value={formatNumber(module.run?.outputTokens ?? 0)} />
            <MetricCard label="总 Token" value={formatNumber(module.run?.totalTokens ?? 0)} />
            <MetricCard label="估算成本" value={formatCost(module.run?.totalCostUsd ?? 0)} />
            <MetricCard label={module.databaseStatusLabel} value={module.databaseStatusValue} />
          </div>

          {module.errorSummary ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-rose-500">错误摘要</div>
              <p className="mt-2 leading-6">{module.errorSummary}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  clamp = true,
}: {
  label: string;
  value: string;
  clamp?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className={`mt-2 text-sm font-medium leading-6 text-slate-900 ${clamp ? "line-clamp-2" : ""}`}>{value}</div>
    </div>
  );
}

function EvidenceSummaryRow({ summary }: { summary: EvidenceSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
        证据 {summary.total} 条
      </span>
      {summary.sources.map((source) => (
        <span
          key={source.sourceName}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
        >
          {source.sourceName} {source.count}
        </span>
      ))}
    </div>
  );
}

function AlertChip({
  label,
  detail,
  tone,
}: {
  key?: string | number;
  label: string;
  detail: string;
  tone: AlertTone;
}) {
  return (
    <div className="group relative" title={detail}>
      <StatusPill label={label} tone={tone} />
      <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 text-[11px] leading-5 text-slate-100 shadow-[0_18px_40px_rgba(15,23,42,0.24)] group-hover:block">
        {detail}
      </div>
    </div>
  );
}

function ProcessRail({ currentStage }: { currentStage: ProcessStageKey }) {
  const currentIndex = getStageIndex(currentStage);

  return (
    <div className="relative rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-5">
      <div className="absolute left-10 right-10 top-10 hidden border-t border-dashed border-slate-300 md:block" />
      <div className="grid gap-3 md:grid-cols-5">
        {PROCESS_STAGES.map((stage, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          const circleClass =
            state === "complete"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : state === "current"
                ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                : "border-slate-300 bg-white text-slate-400";
          const cardClass =
            state === "current"
              ? "border-indigo-300 bg-indigo-950 text-white shadow-[0_16px_40px_rgba(49,46,129,0.22)]"
              : state === "complete"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-500";

          return (
            <div key={stage.key} className={`rounded-2xl border px-3 py-3 ${cardClass}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${circleClass}`}>
                  {state === "complete" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold">{stage.shortLabel}</div>
                  <div className={`mt-1 text-xs leading-5 ${state === "current" ? "text-indigo-100" : "text-inherit/80"}`}>
                    {stage.description}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildPhaseModuleMeta(item: DashboardTaskItem, phase: PhaseKey): PhaseModuleMeta {
  if (phase === "verify") {
    const badge = getVerifyModuleBadge(item);
    return {
      phase,
      eyebrow: "Verify",
      title: "核实模块",
      badgeLabel: badge.label,
      badgeTone: badge.tone,
      conclusionValue: item.verifyResult ?? item.verifiedStatus ?? (item.verifyRun ? "核实中" : "待核实"),
      summaryLabel: "核实结论摘要",
      summaryValue: readTextAtPath(item.raw.poiVerified, ["verification_notes"]) ?? "暂无核实摘要",
      timestampLabel: "核实时间",
      timestampValue: formatDateTime(item.verifiedSummary.verifyTime ?? item.verifyRun?.endedAt ?? item.verifyRun?.startedAt),
      run: item.verifyRun,
      databaseStatusLabel: "数据库核实状态",
      databaseStatusValue: item.verifiedStatus ?? "-",
      scoreLabel: "核实置信度",
      scoreValue: item.verifiedSummary.overallConfidence == null ? "-" : String(item.verifiedSummary.overallConfidence),
      errorSummary: item.verifyRun?.errorSummary ?? null,
    };
  }

  const badge = getQcModuleBadge(item);
  return {
    phase,
    eyebrow: "Quality Control",
    title: "质检模块",
    badgeLabel: badge.label,
    badgeTone: badge.tone,
    conclusionValue: getQcConclusion(item),
    summaryLabel: "质检结论摘要",
    summaryValue:
      readTextAtPath(item.raw.poiQc, ["qc_result_explanation"]) ??
      readTextAtPath(item.raw.poiQc, ["qc_result", "explanation"]) ??
      "暂无质检摘要",
    timestampLabel: "质检时间",
    timestampValue: formatDateTime(item.qcSummary.qcTime ?? item.qcRun?.endedAt ?? item.qcRun?.startedAt),
    run: item.qcRun,
    databaseStatusLabel: "数据库质检状态",
    databaseStatusValue: item.qcStatus ?? item.qualityStatus ?? "-",
    scoreLabel: "质检评分",
    scoreValue: item.qcSummary.qcScore == null ? "-" : String(item.qcSummary.qcScore),
    errorSummary: item.qcRun?.errorSummary ?? null,
  };
}

function getVerifyModuleBadge(item: DashboardTaskItem): { label: string; tone: AlertTone } {
  if (item.verifyRun && item.verifyRun.status !== "success") {
    return { label: "执行异常", tone: "danger" };
  }

  if (item.isManualRequired || item.verifyResult === "需人工核实") {
    return { label: "需人工核实", tone: "warning" };
  }

  if (item.verifyResult || item.verifiedStatus) {
    return { label: "稳定", tone: "success" };
  }

  if (item.verifyRun) {
    return { label: "进行中", tone: "info" };
  }

  return { label: "未开始", tone: "neutral" };
}

function getQcModuleBadge(item: DashboardTaskItem): { label: string; tone: AlertTone } {
  if (item.qcRun && item.qcRun.status !== "success") {
    return { label: "执行异常", tone: "danger" };
  }

  if (item.qcSummary.isQualified === false) {
    return { label: "需关注", tone: "danger" };
  }

  if (item.qcSummary.isQualified === true) {
    return { label: "稳定", tone: "success" };
  }

  if (item.qcRun || item.qualityStatus || item.qcStatus) {
    return { label: "进行中", tone: "info" };
  }

  return { label: "未开始", tone: "neutral" };
}

function getQcConclusion(item: DashboardTaskItem): string {
  if (item.qcSummary.isQualified === true) return "已质检";
  if (item.qcSummary.isQualified === false) return "质检不通过";
  return item.qualityStatus ?? item.qcStatus ?? (item.qcRun ? "质检中" : "待质检");
}

function extractEvidenceSummary(item: DashboardTaskItem): EvidenceSummary | null {
  const evidence = readArrayAtPath(item.raw.poiVerified, ["evidence_record"]);
  if (!evidence.length) return null;

  const sourceCounter = new Map<string, number>();

  for (const entry of evidence) {
    const sourceName =
      readTextAtPath(entry, ["source", "source_name"]) ??
      readTextAtPath(entry, ["data", "raw_data", "source", "source_name"]) ??
      "其他来源";
    sourceCounter.set(sourceName, (sourceCounter.get(sourceName) ?? 0) + 1);
  }

  return {
    total: evidence.length,
    sources: Array.from(sourceCounter.entries())
      .map(([sourceName, count]) => ({ sourceName, count }))
      .sort((left, right) => right.count - left.count || left.sourceName.localeCompare(right.sourceName, "zh-CN")),
  };
}

function readArrayAtPath(source: unknown, path: string[]): Record<string, unknown>[] {
  let current = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }

  if (!Array.isArray(current)) return [];
  return current.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function readTextAtPath(source: unknown, path: string[]): string | null {
  let current = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current !== "string") return null;
  const text = current.trim();
  return text ? text : null;
}

function getAlertClasses(tone: AlertTone): string {
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "info") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}
