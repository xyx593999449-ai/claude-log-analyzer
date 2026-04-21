import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BrainCircuit, ChevronDown, ChevronRight, ClipboardCheck, FileCheck2, FileText, UserRoundSearch } from "lucide-react";
import { fetchHitlIssueTaskDetail, fetchHitlIssueTasks } from "../../lib/dashboardApi";
import type { HitlIssueTaskDetail, HitlIssueTaskListItem } from "../../lib/dashboardTypes";

type GenericRecord = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  taskId: "任务ID",
  name: "名称",
  address: "地址",
  city: "城市",
  poiType: "类型",
  verifyResult: "核实结论",
  verifyInfo: "核实信息",
  evidenceRecord: "证据记录",
  qualityStatus: "质检状态",
  qcStatus: "质检结果",
  qcScore: "质检分数",
  qcResult: "质检明细",
  isQualified: "是否合格",
  hasRisk: "是否风险",
  verifyContentIsCorrect: "核实内容是否正确",
  verifyActionIsCorrect: "核实动作是否正确",
  qcInterceptIsCorrect: "质检拦截是否正确",
  evidenceStatus: "证据状态",
  issueObservationTags: "问题现象标签",
  judgmentDimensionTags: "判断维度标签",
  manualComment: "人工说明",
  conflictingEvidence: "冲突证据",
  manualAddedEvidenceUrl: "人工补证据链接",
  manualAddedEvidenceType: "人工补证据类型",
  manualAddedEvidenceAbstract: "人工补证据摘要",
  verifiedName: "人工修正名称",
  verifiedAddr: "人工修正地址",
  verifiedAddress: "人工修正地址",
  verifiedPoiType: "人工修正类型",
  verifiedCityAdcode: "人工修正行政区划",
  isManualRequired: "是否需要人工介入",
  issueTypeLabel: "问题类型",
  skillTypeLabel: "技能",
  summary: "分析摘要",
  rootCause: "根因明细",
  prompts: "关联Prompt",
};

export function HITLIssueDetailPage() {
  const { batchId = "", issueType = "", taskId: routeTaskId } = useParams();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<HitlIssueTaskListItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(routeTaskId ?? "");
  const [detail, setDetail] = useState<HitlIssueTaskDetail | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedTaskAnalysis, setExpandedTaskAnalysis] = useState(false);
  const [activeDetailPanel, setActiveDetailPanel] = useState<"verify" | "qc" | "manual" | "model">("verify");

  useEffect(() => {
    if (!batchId || !issueType) {
      setError("路由参数不完整，无法加载详情。");
      return;
    }

    let cancelled = false;
    setLoadingTasks(true);
    setError(null);
    fetchHitlIssueTasks(batchId, issueType)
      .then((items) => {
        if (cancelled) return;
        setTasks(items);
        if (items.length === 0) {
          setSelectedTaskId("");
          return;
        }
        const preferred = routeTaskId && items.some((item) => item.taskId === routeTaskId) ? routeTaskId : items[0].taskId;
        setSelectedTaskId(preferred);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "任务列表加载失败");
        setTasks([]);
        setSelectedTaskId("");
      })
      .finally(() => {
        if (!cancelled) setLoadingTasks(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, issueType, routeTaskId]);

  useEffect(() => {
    if (!batchId || !issueType || !selectedTaskId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    fetchHitlIssueTaskDetail(batchId, issueType, selectedTaskId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "详情加载失败");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, issueType, selectedTaskId]);

  useEffect(() => {
    if (!batchId || !issueType || !selectedTaskId) return;
    if (routeTaskId === selectedTaskId) return;
    navigate(`/hitl-iterations/${encodeURIComponent(batchId)}/issues/${encodeURIComponent(issueType)}/tasks/${encodeURIComponent(selectedTaskId)}`, { replace: true });
  }, [batchId, issueType, navigate, routeTaskId, selectedTaskId]);

  useEffect(() => {
    setExpandedTaskAnalysis(false);
    setActiveDetailPanel("verify");
  }, [selectedTaskId]);

  const verifyRows = useMemo(() => toRows(buildVerifyRows(detail)), [detail]);
  const qcRows = useMemo(() => toRows(buildQcRows(detail)), [detail]);
  const manualRows = useMemo(() => toRows(buildManualRows(detail)), [detail]);
  const modelRows = useMemo(() => toRows(detail?.modelAnalysis), [detail?.modelAnalysis]);
  const taskAnalysis = useMemo(() => normalizeTaskAnalysis(detail?.taskAnalysis), [detail?.taskAnalysis]);
  const selectedTask = useMemo(
    () => tasks.find((item) => item.taskId === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const taskMetaTags = useMemo(() => {
    if (!detail) return [];
    return [
      ...(detail.manualResult.issueObservationTags ?? []),
      ...(detail.manualResult.judgmentDimensionTags ?? []),
    ];
  }, [detail]);
  const hasLongTaskAnalysis = taskAnalysis.blocks.length > 3 || taskAnalysis.comment.length > 520;
  const visibleTaskAnalysisBlocks = expandedTaskAnalysis || !hasLongTaskAnalysis ? taskAnalysis.blocks : taskAnalysis.blocks.slice(0, 3);

  return (
    <div className="dashboard-shell dashboard-grid min-h-[calc(100vh-96px)] rounded-[36px] p-4 text-slate-900 sm:p-6 lg:p-8">
      <section className="reveal-card rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/hitl-iterations?batchId=${encodeURIComponent(batchId)}&issueType=${encodeURIComponent(issueType)}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            返回 HITL 列表
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ContextPill label="批次" value={batchId} />
            <ContextPill label="问题类型" value={issueType} />
            <ContextPill label="任务" value={selectedTaskId || "-"} />
          </div>
        </div>
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">HITL 问题详情</div>
          <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight text-slate-950 sm:text-[34px]">任务级核查与分析</h1>
        </div>
      </section>

      {error ? (
        <section className="mt-6 rounded-[32px] border border-rose-200 bg-rose-50/80 p-8 text-sm text-rose-700 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          {error}
        </section>
      ) : null}

      {loadingDetail ? (
        <section className="mt-6 rounded-[32px] border border-white/70 bg-white/82 p-8 text-sm text-slate-500 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          正在加载任务详情...
        </section>
      ) : null}

      {!error ? (
        <section className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <article className="reveal-card delay-1 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">问题任务</div>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">任务导航</h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {tasks.length} 条
                </span>
              </div>
              {loadingTasks ? <div className="mt-4 text-sm text-slate-500">任务列表加载中...</div> : null}
              {tasks.length === 0 && !loadingTasks ? <div className="mt-4 text-sm text-slate-500">当前问题类型下暂无任务</div> : null}
              <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {tasks.map((task, index) => {
                  const selected = task.taskId === selectedTaskId;
                  return (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => setSelectedTaskId(task.taskId)}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                        selected
                          ? "border-teal-200 bg-gradient-to-br from-teal-50 via-cyan-50 to-white shadow-[0_16px_32px_rgba(13,148,136,0.12)]"
                          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">任务 {index + 1}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${selected ? "border-teal-200 bg-white text-teal-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {task.qualityStatus || task.qcStatus || "待补充"}
                        </span>
                      </div>
                      <div className="mt-3 text-sm font-semibold leading-6 text-slate-950">{task.name || "未命名任务"}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.address || "无地址信息"}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">核实 {task.verifyResult || "-"}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">类型 {task.poiType || "-"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          </aside>

          <div className="space-y-6">
            {!loadingDetail && detail ? (
              <>
                <article className="reveal-card delay-2 overflow-hidden rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(244,250,255,0.92))] p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">当前任务</div>
                      <h2 className="mt-2 text-[28px] font-semibold leading-tight text-slate-950">{detail.task.name || selectedTask?.name || "未命名任务"}</h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{detail.task.address || selectedTask?.address || "暂无地址信息"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getVerdictTone(taskAnalysis.verdict).className}`}>
                        {getVerdictTone(taskAnalysis.verdict).label}
                      </span>
                      <ContextPill label="核实" value={detail.verifyResult.verifyResult || "-"} />
                      <ContextPill label="质检" value={detail.qcResult.qualityStatus ?? detail.qcResult.qcStatus ?? "-"} />
                    </div>
                  </div>
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <HeroMetric title="任务 ID" value={detail.task.taskId} />
                    <HeroMetric title="POI 类型" value={detail.task.poiType || selectedTask?.poiType || "暂无"} />
                    <HeroMetric title="分析时间" value={taskAnalysis.createdAt || detail.task.updatetime || "暂无"} />
                  </div>
                  {taskMetaTags.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {taskMetaTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-slate-200/90 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>

                <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Task Analysis</div>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">任务级分析结论</h2>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                      <FileText className="h-5 w-5" />
                    </div>
                  </div>
                  {taskAnalysis.sections.length === 0 ? (
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无任务级分析结论</div>
                  ) : (
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      {taskAnalysis.sections.map((section) => (
                        <article key={`${section.key}-${section.title}`} className={`rounded-[24px] border px-5 py-4 ${getTaskAnalysisSectionTone(section.tone)}`}>
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{section.title}</div>
                          <div className="mt-3 text-sm leading-7 text-slate-700">{section.content}</div>
                        </article>
                      ))}
                    </div>
                  )}
                  {taskAnalysis.blocks.length > 0 ? (
                    <div className="mt-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">原始长文</div>
                      <div className="mt-3 space-y-2">
                        {visibleTaskAnalysisBlocks.map((block, index) => (
                          <div key={`${block.slice(0, 30)}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
                            {block}
                          </div>
                        ))}
                        {hasLongTaskAnalysis ? (
                          <button
                            type="button"
                            onClick={() => setExpandedTaskAnalysis((prev) => !prev)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            {expandedTaskAnalysis ? "收起正文" : "展开正文"}
                            {expandedTaskAnalysis ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>

                <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">详情面板</div>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">核实、质检与人工结果</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <DetailPanelTab label="核实结果" active={activeDetailPanel === "verify"} onClick={() => setActiveDetailPanel("verify")} />
                      <DetailPanelTab label="质检结果" active={activeDetailPanel === "qc"} onClick={() => setActiveDetailPanel("qc")} />
                      <DetailPanelTab label="人工标注" active={activeDetailPanel === "manual"} onClick={() => setActiveDetailPanel("manual")} />
                      <DetailPanelTab label="问题簇分析" active={activeDetailPanel === "model"} onClick={() => setActiveDetailPanel("model")} />
                    </div>
                  </div>
                  <div className="mt-5">
                    {activeDetailPanel === "verify" ? (
                      <ResultTable title="数字员工核实结果" subtitle="核实链路输出" icon={<FileCheck2 className="h-5 w-5" />} rows={verifyRows} sectionKey="verify" expandedRows={expandedRows} onToggle={setExpandedRows} />
                    ) : null}
                    {activeDetailPanel === "qc" ? (
                      <ResultTable title="数字员工质检结果" subtitle="质检链路输出" icon={<ClipboardCheck className="h-5 w-5" />} rows={qcRows} sectionKey="qc" expandedRows={expandedRows} onToggle={setExpandedRows} />
                    ) : null}
                    {activeDetailPanel === "manual" ? (
                      <ResultTable title="人工标注结果" subtitle="人工复核与补证据" icon={<UserRoundSearch className="h-5 w-5" />} rows={manualRows} sectionKey="manual" expandedRows={expandedRows} onToggle={setExpandedRows} />
                    ) : null}
                    {activeDetailPanel === "model" ? (
                      <ResultTable title="问题簇分析与 Prompt 建议" subtitle="问题归因与 Prompt 建议" icon={<BrainCircuit className="h-5 w-5" />} rows={modelRows} sectionKey="model" expandedRows={expandedRows} onToggle={setExpandedRows} />
                    ) : null}
                  </div>
                </article>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ResultTable({
  title,
  subtitle,
  icon,
  rows,
  sectionKey,
  expandedRows,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  rows: Array<{ key: string; label: string; value: unknown }>;
  sectionKey: string;
  expandedRows: Record<string, boolean>;
  onToggle: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{subtitle}</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">{icon}</div>
      </div>
      <div className="mt-4">
        <RowTable rows={rows} sectionKey={sectionKey} expandedRows={expandedRows} onToggle={onToggle} />
      </div>
    </article>
  );
}

function RowTable({
  rows,
  sectionKey,
  expandedRows,
  onToggle,
}: {
  rows: Array<{ key: string; label: string; value: unknown }>;
  sectionKey: string;
  expandedRows: Record<string, boolean>;
  onToggle: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  if (rows.length === 0) {
    return <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无数据</div>;
  }
  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200">
      {rows.map((row) => {
        const rowKey = `${sectionKey}:${row.key}`;
        const expanded = Boolean(expandedRows[rowKey]);
        const render = renderValue(row.value, expanded);
        return (
          <div key={rowKey} className="grid gap-2 border-b border-slate-200 bg-white px-4 py-3 last:border-b-0 lg:grid-cols-[220px_1fr_auto]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{row.label}</div>
            <div className="text-sm leading-6 text-slate-700">{render.text}</div>
            {render.canExpand ? (
              <button
                type="button"
                onClick={() => onToggle((prev) => ({ ...prev, [rowKey]: !expanded }))}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                {expanded ? "收起" : "展开"}
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <div />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderValue(value: unknown, expanded: boolean): { text: string; canExpand: boolean } {
  if (value == null) return { text: "-", canExpand: false };
  if (typeof value === "number" || typeof value === "boolean") return { text: String(value), canExpand: false };
  if (typeof value === "string") {
    const canExpand = value.length > 120;
    return { text: canExpand && !expanded ? `${value.slice(0, 120)}...` : value, canExpand };
  }
  const raw = JSON.stringify(value, null, 2);
  const canExpand = raw.length > 200;
  return { text: canExpand && !expanded ? `${raw.slice(0, 200)}...` : raw, canExpand };
}

function toRows(value: unknown): Array<{ key: string; label: string; value: unknown }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as GenericRecord).map(([key, rowValue]) => ({
    key,
    label: FIELD_LABELS[key] || key,
    value: rowValue,
  }));
}

function buildVerifyRows(detail: HitlIssueTaskDetail | null): GenericRecord | null {
  if (!detail) return null;
  return {
    verifyResult: detail.verifyResult.verifyResult,
    verifyInfo: detail.verifyResult.verifyInfo,
    evidenceRecord: detail.verifyResult.evidenceRecord,
  };
}

function buildQcRows(detail: HitlIssueTaskDetail | null): GenericRecord | null {
  if (!detail) return null;
  const qc = detail.qcResult;
  return {
    qualityStatus: qc.qualityStatus ?? qc.qcStatus ?? null,
    qcStatus: qc.qcStatus,
    qcScore: qc.qcScore,
    isQualified: qc.isQualified,
    hasRisk: qc.hasRisk,
    isManualRequired: qc.isManualRequired ?? null,
    qcResult: qc.qcResult,
  };
}

function buildManualRows(detail: HitlIssueTaskDetail | null): GenericRecord | null {
  if (!detail) return null;
  const manual = detail.manualResult;
  const { verifiedAddress, ...rest } = manual;
  return {
    ...rest,
    verifiedAddr: manual.verifiedAddr ?? verifiedAddress ?? null,
  };
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </span>
  );
}

function HeroMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function DetailPanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-teal-200 bg-teal-50 text-teal-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function normalizeTaskAnalysis(taskAnalysis: HitlIssueTaskDetail["taskAnalysis"] | undefined): {
  comment: string;
  blocks: string[];
  sections: Array<{
    key: string;
    title: string;
    tone: "summary" | "problem" | "evidence" | "root_cause" | "suggestion" | "other";
    content: string;
  }>;
  verdict: string | null;
  createdAt: string | null;
} {
  const comment =
    (taskAnalysis?.analysisComment ?? taskAnalysis?.analysis_comment ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\s+$/g, "")
      .trim();
  const explicitBlocks =
    taskAnalysis?.analysisCommentBlocks ??
    taskAnalysis?.analysis_comment_blocks ??
    [];
  const explicitSections =
    taskAnalysis?.analysisSections ??
    taskAnalysis?.analysis_sections ??
    [];
  const blocks = explicitBlocks.length > 0 ? explicitBlocks.filter(Boolean) : splitAnalysisComment(comment);
  return {
    comment,
    blocks,
    sections: explicitSections.filter((item) => item && item.content),
    verdict: taskAnalysis?.overallVerdict ?? taskAnalysis?.overall_verdict ?? null,
    createdAt: taskAnalysis?.createdAt ?? taskAnalysis?.created_at ?? null,
  };
}

function splitAnalysisComment(comment: string): string[] {
  if (!comment) return [];
  const paragraphParts = comment
    .split(/\n{2,}/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (paragraphParts.length > 1) return paragraphParts;

  return comment
    .split(/[。；;]\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `${item}。`);
}

function getVerdictTone(verdict: string | null): { label: string; className: string } {
  const normalized = (verdict ?? "").toLowerCase();
  if (normalized === "critical_issue") return { label: "结论：严重问题", className: "border-rose-200 bg-rose-50 text-rose-700" };
  if (normalized === "major_issue") return { label: "结论：主要问题", className: "border-orange-200 bg-orange-50 text-orange-700" };
  if (normalized === "minor_issue") return { label: "结论：轻微问题", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (normalized === "no_issue") return { label: "结论：无明显问题", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: verdict ? `结论：${verdict}` : "结论：暂无", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

function getTaskAnalysisSectionTone(tone: "summary" | "problem" | "evidence" | "root_cause" | "suggestion" | "other"): string {
  if (tone === "summary") return "border-teal-200 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/80";
  if (tone === "problem") return "border-rose-200 bg-gradient-to-br from-rose-50/90 via-white to-orange-50/70";
  if (tone === "evidence") return "border-sky-200 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/70";
  if (tone === "root_cause") return "border-amber-200 bg-gradient-to-br from-amber-50/90 via-white to-yellow-50/70";
  if (tone === "suggestion") return "border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70";
  return "border-slate-200 bg-slate-50/80";
}
