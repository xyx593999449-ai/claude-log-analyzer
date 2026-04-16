import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BrainCircuit, ChevronDown, ChevronRight, ClipboardCheck, FileCheck2, UserRoundSearch } from "lucide-react";
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
  verifiedPoiType: "人工修正类型",
  verifiedCityAdcode: "人工修正行政区划",
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

  const verifyRows = useMemo(() => toRows(detail?.verifyResult), [detail?.verifyResult]);
  const qcRows = useMemo(() => toRows(detail?.qcResult), [detail?.qcResult]);
  const manualRows = useMemo(() => toRows(detail?.manualResult), [detail?.manualResult]);
  const modelRows = useMemo(() => toRows(detail?.modelAnalysis), [detail?.modelAnalysis]);

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
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">采用行级信息展示，长内容默认折叠，重点内容优先可读。模型分析结论已预留，后续可接新表。</p>
        </div>
      </section>

      <section className="mt-6 reveal-card delay-1 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">问题任务</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">人工标注任务列表</h2>
        {loadingTasks ? <div className="mt-4 text-sm text-slate-500">任务列表加载中...</div> : null}
        {tasks.length === 0 && !loadingTasks ? <div className="mt-4 text-sm text-slate-500">当前问题类型下暂无任务</div> : null}
        <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200">
          {tasks.map((task) => {
            const selected = task.taskId === selectedTaskId;
            return (
              <button
                key={task.taskId}
                type="button"
                onClick={() => setSelectedTaskId(task.taskId)}
                className={`grid w-full gap-2 border-b border-slate-200 px-4 py-3 text-left transition last:border-b-0 lg:grid-cols-[2fr_1fr_1fr] ${
                  selected ? "bg-gradient-to-r from-teal-50 to-cyan-50" : "bg-white hover:bg-slate-50"
                }`}
              >
                <div>
                  <div className="font-mono text-xs text-slate-700">{task.taskId}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{task.name || "未命名任务"}</div>
                  <div className="mt-1 text-xs text-slate-500">{task.address || "无地址信息"}</div>
                </div>
                <div className="text-xs text-slate-600">核实: {task.verifyResult || "-"}</div>
                <div className="text-xs text-slate-600">质检: {task.qualityStatus || "-"}</div>
              </button>
            );
          })}
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

      {!loadingDetail && !error && detail ? (
        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <ResultTable title="数字员工核实结果" subtitle="核实链路输出" icon={<FileCheck2 className="h-5 w-5" />} rows={verifyRows} sectionKey="verify" expandedRows={expandedRows} onToggle={setExpandedRows} />
          <ResultTable title="数字员工质检结果" subtitle="质检链路输出" icon={<ClipboardCheck className="h-5 w-5" />} rows={qcRows} sectionKey="qc" expandedRows={expandedRows} onToggle={setExpandedRows} />
          <ResultTable title="人工标注结果" subtitle="人工复核与补证据" icon={<UserRoundSearch className="h-5 w-5" />} rows={manualRows} sectionKey="manual" expandedRows={expandedRows} onToggle={setExpandedRows} />
          <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">问题归因与 Prompt 建议</div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">模型分析结果</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                <BrainCircuit className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              模型分析结论（预留）：后续接入单独结果表后，在此展示每条任务的独立分析结论。
            </div>
            <div className="mt-4">
              <RowTable rows={modelRows} sectionKey="model" expandedRows={expandedRows} onToggle={setExpandedRows} />
            </div>
          </article>
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

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </span>
  );
}
