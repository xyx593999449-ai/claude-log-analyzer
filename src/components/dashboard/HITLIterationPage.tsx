import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  GitBranch,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";
import { fetchHitlIterationDetail, fetchHitlIterations } from "../../lib/dashboardApi";
import type {
  HitlFlowStep,
  HitlFlowStepId,
  HitlFlowStepStatus,
  HitlIterationDetail,
  HitlIterationListItem,
  HitlPromptItem,
  HitlRootCauseItem,
} from "../../lib/dashboardTypes";

const FLOW_META: Array<{ id: HitlFlowStepId; label: string; icon: typeof Users }> = [
  { id: "feedback", label: "反馈池", icon: Users },
  { id: "analysis", label: "问题分析", icon: BrainCircuit },
  { id: "iteration", label: "迭代处理", icon: FlaskConical },
  { id: "candidate", label: "候选版本", icon: Rocket },
  { id: "regression", label: "回归验证", icon: GitBranch },
  { id: "decision", label: "最终结论", icon: ShieldCheck },
];

const DEFAULT_UNAVAILABLE_SUMMARY: Record<HitlFlowStepId, string> = {
  feedback: "待补充",
  analysis: "待补充",
  iteration: "待补充",
  candidate: "待补充",
  regression: "当前数据未 ready，待补充。",
  decision: "当前数据未 ready，待补充。",
};

const STEP_STATUS_META: Record<HitlFlowStepStatus, { text: string; className: string }> = {
  completed: { text: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  active: { text: "进行中", className: "border-amber-200 bg-amber-50 text-amber-700" },
  pending: { text: "待处理", className: "border-slate-200 bg-slate-100 text-slate-700" },
  unavailable: { text: "待补充", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

const BATCH_STATUS_META: Record<string, { label: string; className: string }> = {
  analysis: { label: "分析中", className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
  iterating: { label: "迭代中", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  regression: { label: "回归中", className: "border-sky-200 bg-sky-50 text-sky-700" },
  completed: { label: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  unavailable: { label: "待补充", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

const ISSUE_LABEL_MAP: Record<string, string> = {
  evidence_missing: "证据缺失",
  evidence_invalid: "证据无效",
  evidence_conflicting: "证据冲突",
  invalid_evidence_cited: "引用无效证据",
  name_judgment_problem: "名称判断问题",
  address_judgment_problem: "地址判断问题",
  type_judgment_problem: "类型判断问题",
  location_judgment_problem: "坐标判断问题",
  admin_judgment_problem: "行政区划判断问题",
  evidence_usage_problem: "证据使用问题",
  manual_escalation_strategy_problem: "转交策略问题",
  qc_intercept_rule_problem: "质检拦截规则问题",
};

export function HITLIterationPage() {
  const [batches, setBatches] = useState<HitlIterationListItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HitlIterationDetail | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<Record<string, boolean>>({});
  const [expandedRootCause, setExpandedRootCause] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingBatches(true);
    fetchHitlIterations()
      .then((data) => {
        if (cancelled) return;
        setBatches(data);
        setListError(null);
        setSelectedBatchId((prev) => {
          if (prev && data.some((item) => item.batchId === prev)) {
            return prev;
          }
          return data[0]?.batchId ?? null;
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(error instanceof Error ? error.message : "加载批次失败");
        setBatches([]);
        setSelectedBatchId(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBatches(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBatchId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    fetchHitlIterationDetail(selectedBatchId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : "加载批次详情失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchId]);

  useEffect(() => {
    setExpandedRootCause(false);
  }, [selectedBatchId]);

  const selectedBatch = useMemo(() => batches.find((item) => item.batchId === selectedBatchId) ?? null, [batches, selectedBatchId]);
  const flowSteps = useMemo(() => normalizeFlow(detail?.flow), [detail?.flow]);
  const currentStepIndex = useMemo(() => getCurrentStepIndex(flowSteps), [flowSteps]);

  const totalRootCauseCount = useMemo(
    () => (detail?.rootCauses ?? []).reduce((acc, item) => acc + Math.max(item.count, 0), 0),
    [detail?.rootCauses],
  );

  const groupedPrompts = useMemo(() => groupPromptsBySkill(detail?.prompts ?? []), [detail?.prompts]);
  const rootCauseSummary = detail?.overlayInsight?.rootCauseAnalysis ?? null;
  const learnablePatterns = detail?.overlayInsight?.learnablePatterns ?? [];
  const skillImpacts = detail?.overlayInsight?.skillImpact ?? [];
  const skillImpactMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const impact of skillImpacts) {
      const key = normalizeSkillKey(impact.skillType);
      if (key) map.set(key, impact.impactSummary);
    }
    return map;
  }, [skillImpacts]);
  const hasLongRootCauseSummary = (rootCauseSummary?.length ?? 0) > 260;
  const rootCauseSummaryPreview =
    rootCauseSummary && hasLongRootCauseSummary && !expandedRootCause ? `${rootCauseSummary.slice(0, 260)}…` : rootCauseSummary;

  return (
    <div className="dashboard-shell dashboard-grid min-h-[calc(100vh-96px)] rounded-[36px] p-4 text-slate-900 sm:p-6 lg:p-8">
      <section className="reveal-card rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">HITL 迭代</div>
            <h1 className="mt-2 font-display text-[34px] font-semibold leading-tight text-slate-950 sm:text-[40px]">迭代批次</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <HeroMetric title="开始时间" value={formatDateTime(selectedBatch?.startedAt)} />
            <HeroMetric title="样本数" value={`${selectedBatch?.sampleCount ?? "-"}`} />
            <HeroMetric title="问题数" value={`${selectedBatch?.issueCount ?? "-"}`} />
          </div>
        </div>

        {listError ? <InlineError text={listError} /> : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {loadingBatches ? <InlineInfo text="批次加载中..." /> : null}
          {!loadingBatches && batches.length === 0 ? <InlineInfo text="暂无批次数据" /> : null}
          {batches.map((batch) => {
            const selected = batch.batchId === selectedBatchId;
            const statusMeta = getBatchStatusMeta(batch.status);
            return (
              <button
                key={batch.batchId}
                type="button"
                onClick={() => setSelectedBatchId(batch.batchId)}
                className={`group rounded-[24px] border p-5 text-left transition ${
                  selected
                    ? "border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 text-slate-900 shadow-[0_16px_36px_rgba(13,148,136,0.12)]"
                    : "border-slate-200 bg-slate-50/75 text-slate-900 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`font-mono text-[11px] font-bold uppercase tracking-[0.22em] ${selected ? "text-teal-700" : "text-slate-500"}`}>
                      {batch.batchId}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">{batch.summary ?? "暂无批次摘要"}</div>
                  </div>
                  <ChevronRight className={`mt-1 h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-300 group-hover:text-slate-500"}`} />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <StatusPill label={statusMeta.label} className={selected ? "border-teal-200 bg-white/85 text-teal-700" : statusMeta.className} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 reveal-card delay-1 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">迭代流程</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedBatch?.batchId ?? "未选择批次"}</h2>
          </div>
          <StatusPill label={`当前：${FLOW_META[currentStepIndex]?.label ?? "反馈池"}`} className="border-slate-200 bg-slate-50 text-slate-700" />
        </div>

        {loadingDetail ? <div className="mt-5 text-sm text-slate-500">批次详情加载中...</div> : null}
        {detailError ? <InlineError text={detailError} /> : null}

        <div className="mt-7 overflow-x-auto">
          <div className="flex min-w-[760px] items-center gap-3">
            {FLOW_META.map((step, index) => {
              const Icon = step.icon;
              const status = flowSteps[index]?.status ?? "pending";
              const current = status === "active";
              const active = current || status === "completed";
              return (
                <div key={step.id} className="flex flex-1 items-center gap-3">
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 ${
                        current
                          ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-700 shadow-[0_12px_28px_rgba(245,158,11,0.12)]"
                          : active
                            ? "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 text-sky-700"
                            : status === "unavailable"
                              ? "border-slate-200 bg-slate-100 text-slate-400"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className={`text-xs font-bold ${current ? "text-amber-700" : active ? "text-sky-700" : "text-slate-400"}`}>{step.label}</div>
                  </div>
                  {index < FLOW_META.length - 1 ? (
                    <div className="flex flex-1 justify-center">
                      <ArrowRight className={`h-4 w-4 ${active ? "text-slate-500" : "text-slate-300"}`} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {flowSteps.map((step) => (
            <article key={step.id} className={`rounded-[24px] border p-4 ${getFlowStepCardClass(step.status)}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${step.status === "active" ? "text-amber-700" : "text-slate-400"}`}>{step.label}</div>
                <StatusPill label={STEP_STATUS_META[step.status].text} className={STEP_STATUS_META[step.status].className} />
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-600">{step.summary}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">根因分析</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">根因分析</h2>
          {rootCauseSummary ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-xs font-semibold text-slate-600">批次问题总述</div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                <ReadableSummary text={rootCauseSummaryPreview ?? ""} />
              </div>
              {hasLongRootCauseSummary ? (
                <button
                  type="button"
                  onClick={() => setExpandedRootCause((prev) => !prev)}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-white"
                >
                  {expandedRootCause ? "收起分析" : "展开分析"}
                  {expandedRootCause ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </div>
          ) : null}
          {learnablePatterns.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-xs font-semibold text-slate-600">可学习模式</div>
              <div className="space-y-2">
                {learnablePatterns.slice(0, 4).map((item, idx) => (
                  <div key={`${item.issueType}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-800">{item.issueTypeLabel}</span>
                      <span className="font-mono text-slate-500">{item.issueType}</span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{item.count} 次</span>
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-700">
                      <ReadableSummary text={item.pattern} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {(detail?.rootCauses ?? []).length === 0 ? <InlineInfo text="暂无根因数据" /> : null}
            {(detail?.rootCauses ?? []).map((item) => (
              <div key={`${item.skillType}-${item.issueType}-${item.issueTypeLabel}`}>
                <RootCauseRow item={item} total={totalRootCauseCount} batchId={selectedBatch?.batchId ?? ""} />
              </div>
            ))}
          </div>
        </article>

        <article className="reveal-card delay-3 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">迭代建议</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">迭代建议</h2>
          <div className="mt-5 space-y-4">
            {groupedPrompts.length === 0 ? <InlineInfo text="暂无 Prompt 数据" /> : null}
            {groupedPrompts.map((group) => {
              const skillTheme = getSkillColorTheme(group.skillKey);
              return (
              <article key={group.skillKey} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="inline-flex rounded-full border px-3 py-1 text-sm font-semibold"
                    style={{
                      borderColor: skillTheme.borderColor,
                      backgroundColor: skillTheme.bgColor,
                      color: skillTheme.textColor,
                    }}
                  >
                    {group.skillLabel}
                  </span>
                  <StatusPill
                    label={`${group.items.length} 条 Prompt`}
                    className="bg-white"
                    style={{ borderColor: skillTheme.borderColor, color: skillTheme.textColor }}
                  />
                </div>
                {getSkillImpactForPromptGroup(skillImpactMap, group.skillKey) ? (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-600">技能影响</div>
                    <div className="mt-1 text-sm leading-6 text-slate-700">{renderSkillImpactSummary(getSkillImpactForPromptGroup(skillImpactMap, group.skillKey) ?? "")}</div>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {group.items.map((prompt, idx) => {
                    const key = `${group.skillKey}:${idx}`;
                    const expanded = Boolean(expandedPrompt[key]);
                    const isLong = prompt.content.length > 320;
                    return (
                      <div key={`${prompt.promptFileName}-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-700">迭代提示词</div>
                          {isLong ? (
                            <button
                              type="button"
                              onClick={() => setExpandedPrompt((prev) => ({ ...prev, [key]: !expanded }))}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              {expanded ? "收起" : "展开"}
                              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        </div>
                        {prompt.promptPath ? <div className="mt-1 text-[11px] text-slate-500">{prompt.promptPath}</div> : null}
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <MarkdownPreview content={prompt.content} collapsed={!expanded && isLong} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className="mt-6 reveal-card delay-4 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">版本变更</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">按技能纵向记录</h2>
        <div className="mt-5 overflow-hidden rounded-[22px] border border-slate-200">
          {(detail?.modifications ?? []).length === 0 ? <InlineInfo text="暂无版本变更数据" className="m-3" /> : null}
          {(detail?.modifications ?? []).map((record, index) => (
            <div key={`${record.targetSkill}-${record.createdAt ?? index}`} className="grid gap-3 border-b border-slate-200 bg-white px-4 py-4 last:border-b-0 lg:grid-cols-[220px_1fr_220px]">
              <div>
                <div className="text-sm font-semibold text-slate-900">{record.targetSkillLabel || record.targetSkill}</div>
                <div className="mt-1 text-xs text-slate-500">{formatDateTime(record.createdAt)}</div>
              </div>
              <div>
                <div className="text-sm leading-6 text-slate-700">
                  <ReadableSummary text={record.changeSummary ?? "暂无修改摘要"} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {record.modifiedFiles.length > 0 ? (
                    record.modifiedFiles.map((file) => (
                      <span key={file} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                        {file}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">暂无文件信息</span>
                  )}
                </div>
              </div>
              <div className="flex items-start justify-start lg:justify-end">
                <StatusPill label={record.status ?? "待补充"} className="border-slate-200 bg-slate-50 text-slate-700" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="reveal-card delay-5 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">回归验证</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">回归验证</h2>
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">当前状态</span>
              <StatusPill
                label={STEP_STATUS_META[flowSteps.find((s) => s.id === "regression")?.status ?? "unavailable"].text}
                className={STEP_STATUS_META[flowSteps.find((s) => s.id === "regression")?.status ?? "unavailable"].className}
              />
            </div>
            <p className="text-sm leading-6 text-slate-600">{flowSteps.find((s) => s.id === "regression")?.summary ?? "待补充"}</p>
          </div>
        </article>

        <article className="reveal-card delay-6 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">最终结论</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">最终结论</h2>
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">当前状态</span>
              <StatusPill
                label={STEP_STATUS_META[flowSteps.find((s) => s.id === "decision")?.status ?? "unavailable"].text}
                className={STEP_STATUS_META[flowSteps.find((s) => s.id === "decision")?.status ?? "unavailable"].className}
              />
            </div>
            <p className="text-sm leading-6 text-slate-600">{flowSteps.find((s) => s.id === "decision")?.summary ?? "待补充"}</p>
          </div>
        </article>
      </section>
    </div>
  );
}

function RootCauseRow({
  item,
  total,
  batchId,
}: {
  item: HitlRootCauseItem;
  total: number;
  batchId: string;
}) {
  const ratio = total > 0 ? item.count / total : 0;
  const percent = Math.round(ratio * 1000) / 10;
  const skillTheme = getSkillColorTheme(item.skillType);
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{item.issueTypeLabel || item.issueType}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">{item.issueType}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            label={item.skillTypeLabel || item.skillType}
            className=""
            style={{
              borderColor: skillTheme.borderColor,
              backgroundColor: skillTheme.bgColor,
              color: skillTheme.textColor,
            }}
          />
          <span className="font-mono text-sm font-semibold text-slate-700">{item.count}</span>
          <span className="font-mono text-xs text-slate-500">{percent}%</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>占比轴</span>
          <span>0% - 100%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${Math.max(2, percent)}%` }} />
        </div>
      </div>
      {batchId ? (
        <Link to={`/hitl-iterations/${encodeURIComponent(batchId)}/issues/${encodeURIComponent(item.issueType)}`} className="mt-3 inline-flex text-sm font-medium text-teal-700 hover:text-teal-800">
          查看问题详情
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function HeroMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function StatusPill({ label, className, style }: { label: string; className: string; style?: CSSProperties }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`} style={style}>
      {label}
    </span>
  );
}

function InlineInfo({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 ${className}`}>{text}</div>;
}

function InlineError({ text }: { text: string }) {
  return <div className="mt-6 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{text}</div>;
}

function normalizeFlow(flow: HitlFlowStep[] | undefined): HitlFlowStep[] {
  const flowMap = new Map((flow ?? []).map((item) => [item.id, item]));
  return FLOW_META.map((meta) => {
    const item = flowMap.get(meta.id);
    return {
      id: meta.id,
      label: item?.label || meta.label,
      status: item?.status || (meta.id === "regression" || meta.id === "decision" ? "unavailable" : "pending"),
      summary: item?.summary || DEFAULT_UNAVAILABLE_SUMMARY[meta.id],
    };
  });
}

function getCurrentStepIndex(flow: HitlFlowStep[]): number {
  const activeIndex = flow.findIndex((step) => step.status === "active");
  if (activeIndex >= 0) return activeIndex;
  for (let idx = flow.length - 1; idx >= 0; idx -= 1) {
    if (flow[idx].status === "completed") return idx;
  }
  return 0;
}

function getFlowStepCardClass(status: HitlFlowStepStatus): string {
  if (status === "active") {
    return "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-slate-900 shadow-[0_12px_28px_rgba(245,158,11,0.08)]";
  }
  if (status === "completed") {
    return "border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/80 text-slate-900";
  }
  if (status === "unavailable") {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  return "border-slate-200 bg-white text-slate-500";
}

function getBatchStatusMeta(status: string | null): { label: string; className: string } {
  if (!status) return BATCH_STATUS_META.unavailable;
  return BATCH_STATUS_META[status] ?? { label: status, className: "border-slate-200 bg-slate-100 text-slate-700" };
}

function groupPromptsBySkill(prompts: HitlPromptItem[]): Array<{ skillKey: string; skillLabel: string; items: HitlPromptItem[] }> {
  const buckets = new Map<string, { skillKey: string; skillLabel: string; items: HitlPromptItem[] }>();
  for (const prompt of prompts) {
    const rawKey = prompt.skillKey || prompt.promptFileName || "unknown";
    const key = normalizeSkillKey(rawKey);
    const label = getSkillDisplayLabel(key, prompt.skillLabel);
    if (!buckets.has(key)) {
      buckets.set(key, { skillKey: key, skillLabel: label, items: [] });
    }
    buckets.get(key)!.items.push(prompt);
  }
  return Array.from(buckets.values());
}

function getSkillImpactForPromptGroup(skillImpactMap: Map<string, string>, skillKey: string): string | null {
  const normalizedSkillKey = normalizeSkillKey(skillKey);
  if (skillImpactMap.has(normalizedSkillKey)) {
    return skillImpactMap.get(normalizedSkillKey) ?? null;
  }
  for (const [impactKey, impactSummary] of skillImpactMap.entries()) {
    const normalizedImpactKey = normalizeSkillKey(impactKey);
    if (normalizedSkillKey.includes(normalizedImpactKey) || normalizedImpactKey.includes(normalizedSkillKey)) {
      return impactSummary;
    }
  }
  return null;
}

function normalizeSkillKey(skillKey: string): string {
  const normalized = skillKey.toLowerCase();
  if (normalized.includes("qc")) return "qc-stable";
  if (normalized.includes("verify")) return "verification";
  if (normalized.includes("evidence") || normalized.includes("collection")) return "evidence-collection";
  return normalized;
}

function getSkillColorTheme(skillKey: string): { textColor: string; borderColor: string; bgColor: string } {
  const normalized = normalizeSkillKey(skillKey || "unknown");
  const hash = hashText(normalized);
  const hue = hash % 360;
  return {
    textColor: `hsl(${hue} 58% 36%)`,
    borderColor: `hsl(${hue} 68% 82%)`,
    bgColor: `hsl(${hue} 92% 96%)`,
  };
}

function hashText(input: string): number {
  let hash = 0;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash = (hash * 31 + input.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

function getSkillDisplayLabel(normalizedSkillKey: string, rawLabel?: string): string {
  const text = (rawLabel ?? "").trim();
  if (text && !/[\\/]/.test(text) && !/\.txt$/i.test(text)) {
    return text;
  }
  if (normalizedSkillKey === "qc-stable") return "质检 Skill (qc-stable)";
  if (normalizedSkillKey === "verification") return "核实 Skill (verification)";
  if (normalizedSkillKey === "evidence-collection") return "证据收集 Skill (evidence-collection)";
  return normalizedSkillKey;
}

function renderSkillImpactSummary(summary: string): ReactNode {
  const items = parseSkillImpactItems(summary);
  if (items.length === 0) {
    return <ReadableSummary text={summary} />;
  }
  return (
    <ul className="space-y-1.5 pl-4">
      {items.map((item, idx) => (
        <li key={`${item.issueType}-${idx}`} className="list-disc">
          <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700">{item.issueType}</span>
          <span className="mx-1 text-slate-500">·</span>
          <strong className="font-semibold text-slate-900">{item.issueTypeLabel}</strong>
          <span className="mx-1 text-slate-400">:</span>
          <span>{item.summary}</span>
        </li>
      ))}
    </ul>
  );
}

function parseSkillImpactItems(summary: string): Array<{ issueType: string; issueTypeLabel: string; summary: string }> {
  const normalized = summary.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks = normalized.split(/,\s*(?=\[[^\]]+\])/g).map((item) => item.trim()).filter(Boolean);
  const result: Array<{ issueType: string; issueTypeLabel: string; summary: string }> = [];
  for (const chunk of chunks) {
    const matched = chunk.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!matched) continue;
    const issueType = matched[1].trim();
    const issueTypeLabel = ISSUE_LABEL_MAP[issueType] ?? issueType;
    result.push({
      issueType,
      issueTypeLabel,
      summary: matched[2].trim(),
    });
  }
  return result;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "待补充";
  return value;
}

function ReadableSummary({ text }: { text: string }) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/根因分析[:：]\s*/g, "").trim();
  if (!normalized) return <span>—</span>;

  const segments = normalized
    .split(/\n|[；;]+|(?=\s*-\s*[^\s])/g)
    .map((item) => item.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return <p className="whitespace-pre-wrap break-words">{renderEmphasis(normalized)}</p>;
  }

  return (
    <ul className="space-y-1.5 pl-4">
      {segments.map((segment, idx) => (
        <li key={`${segment.slice(0, 20)}-${idx}`} className="list-disc">
          {renderEmphasis(segment)}
        </li>
      ))}
    </ul>
  );
}

function MarkdownPreview({ content, collapsed }: { content: string; collapsed: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ type: string; text: string }> = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push({ type: "list", text: listBuffer.join("\n") });
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      blocks.push({ type: "empty", text: "" });
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2).trim());
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  flushList();

  return (
    <div className={`relative text-sm leading-6 text-slate-700 ${collapsed ? "max-h-56 overflow-hidden" : ""}`}>
      {blocks.map((block, idx) => {
        if (block.type === "empty") {
          return <div key={`empty-${idx}`} className="h-2" />;
        }
        if (block.type === "h1") {
          return (
            <h4 key={`h1-${idx}`} className="mt-2 text-sm font-semibold text-slate-900">
              {renderInlineMarkdown(block.text)}
            </h4>
          );
        }
        if (block.type === "h2" || block.type === "h3") {
          return (
            <h5 key={`h2-${idx}`} className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              {renderInlineMarkdown(block.text)}
            </h5>
          );
        }
        if (block.type === "list") {
          const items = block.text.split("\n").filter(Boolean);
          return (
            <ul key={`list-${idx}`} className="my-2 space-y-1 pl-4">
              {items.map((item, itemIdx) => (
                <li key={`li-${idx}-${itemIdx}`} className="list-disc">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${idx}`} className="my-1">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
      {collapsed ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-50/95 to-transparent" /> : null}
    </div>
  );
}

function renderEmphasis(input: string): ReactNode[] {
  const firstColon = input.search(/[:：]/);
  const hasLabel = firstColon > 0 && firstColon < 36;
  const label = hasLabel ? input.slice(0, firstColon + 1) : "";
  const rest = hasLabel ? input.slice(firstColon + 1).trim() : input;

  const nodes: ReactNode[] = [];
  if (label) {
    nodes.push(
      <strong key="label" className="font-semibold text-slate-900">
        {label}
      </strong>,
    );
    nodes.push(<span key="gap"> </span>);
  }

  const parts = rest.split(/(出现\s*\d+\s*次|`[^`]+`)/g).filter(Boolean);
  parts.forEach((part, idx) => {
    if (/^出现\s*\d+\s*次$/.test(part)) {
      nodes.push(
        <span key={`count-${idx}`} className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
          {part}
        </span>,
      );
      return;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={`code-${idx}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800">
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    nodes.push(<span key={`text-${idx}`}>{part}</span>);
  });

  return nodes;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  parts.forEach((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={`code-${idx}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800">
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <strong key={`strong-${idx}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    nodes.push(<span key={`span-${idx}`}>{part}</span>);
  });
  return nodes;
}
