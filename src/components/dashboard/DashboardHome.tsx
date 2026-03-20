import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, Search, Sparkles, UploadCloud } from "lucide-react";
import { clearCache, fetchFilterOptions, fetchOverview, fetchTaskList, importLogsByFiles } from "../../lib/dashboardApi";
import type { DashboardOverview, FilterOptions, TaskListResult } from "../../lib/dashboardTypes";
import { TaskFlowCard } from "./TaskFlowCard";
import {
  PROCESS_STAGES,
  buildAlerts,
  formatDateTime,
  formatNumber,
  formatPercent,
  type AlertTone,
  type ProcessStageKey,
  type UploadItem,
} from "./dashboardModel";
import { ExecutionCard, SectionIntro, SpotlightCard, StatusPill, UploadZone } from "./dashboardWidgets";

interface DashboardHomeProps {
  onOpenLogs: (taskId: string) => void;
}

interface QueryState {
  page: number;
  pageSize: number;
  search: string;
  verifyStatus: string;
  qcStatus: string;
  alertTags: string[];
  manualOnly: boolean;
  anomalyOnly: boolean;
}

interface StageDistributionItem {
  key: ProcessStageKey;
  label: string;
  shortLabel: string;
  description: string;
  value: number;
}

interface AlertTagItem {
  label: string;
  tone: AlertTone;
  count: number;
}

interface FlowBranchItem {
  id: string;
  label: string;
  detail: string;
  value: number;
  tone: AlertTone;
}

const ALERT_FILTER_TAGS: Array<{ label: string; tone: AlertTone }> = [
  { label: "核实阻塞异常", tone: "danger" },
  { label: "核实执行异常", tone: "warning" },
  { label: "质检阻塞异常", tone: "danger" },
  { label: "质检执行异常", tone: "warning" },
  { label: "需人工介入", tone: "warning" },
  { label: "质检不通过", tone: "danger" },
  { label: "高风险任务", tone: "danger" },
  { label: "核实状态不一致", tone: "warning" },
  { label: "质检状态不一致", tone: "warning" },
];

export function DashboardHome({ onOpenLogs }: DashboardHomeProps) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [taskList, setTaskList] = useState<TaskListResult | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ verifyStatuses: [], qcStatuses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [query, setQuery] = useState<QueryState>({
    page: 1,
    pageSize: 20,
    search: "",
    verifyStatus: "",
    qcStatus: "",
    alertTags: [],
    manualOnly: false,
    anomalyOnly: false,
  });
  const [verifyUploads, setVerifyUploads] = useState<UploadItem[]>([]);
  const [qcUploads, setQcUploads] = useState<UploadItem[]>([]);

  async function loadOverviewAndTasks(currentQuery: QueryState): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, tasksRes] = await Promise.all([fetchOverview(), fetchTaskList(currentQuery)]);
      setOverview(overviewRes);
      setTaskList(tasksRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions({ verifyStatuses: [], qcStatuses: [] }));
  }, []);

  useEffect(() => {
    loadOverviewAndTasks(query).catch(() => {
      // handled above
    });
  }, [query]);

  const totalPages = useMemo(() => {
    if (!taskList) return 1;
    return Math.max(1, Math.ceil(taskList.total / taskList.pageSize));
  }, [taskList]);

  async function handleImport(): Promise<void> {
    setImporting(true);
    setError("");
    try {
      if (verifyUploads.length === 0 && qcUploads.length === 0) {
        throw new Error("请先上传核实或质检日志文件");
      }

      const result = await importLogsByFiles({
        source: "manual_upload",
        files: [
          ...verifyUploads.map((item) => ({ phase: "verify" as const, role: item.role, file: item.file })),
          ...qcUploads.map((item) => ({ phase: "qc" as const, role: item.role, file: item.file })),
        ],
      });

      if (result.totalTaskRuns === 0) {
        setError("导入完成，但没有识别到有效任务。");
      }

      await loadOverviewAndTasks({ ...query, page: 1 });
      setQuery((prev) => ({ ...prev, page: 1 }));
      setUploadExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "日志导入失败");
    } finally {
      setImporting(false);
    }
  }

  async function handleClearCache(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      await clearCache();
      setVerifyUploads([]);
      setQcUploads([]);
      await loadOverviewAndTasks({ ...query, page: 1 });
      setQuery((prev) => ({ ...prev, page: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "清除缓存失败");
    } finally {
      setLoading(false);
    }
  }

  function toggleAlertTag(label: string): void {
    setQuery((prev) => ({
      ...prev,
      page: 1,
      alertTags: prev.alertTags.includes(label)
        ? prev.alertTags.filter((item) => item !== label)
        : [...prev.alertTags, label],
    }));
  }

  const totalTasks = overview?.totalTasks ?? 0;
  const manualTaskCount = overview?.manualMonitoring.manualTaskCount ?? 0;
  const anomalyCount = overview?.manualMonitoring.anomalyCount ?? 0;
  const qcRejectedCount = overview?.manualMonitoring.qcRejectedCount ?? 0;
  const anomalyRate = totalTasks > 0 ? anomalyCount / totalTasks : 0;
  const manualRate = totalTasks > 0 ? manualTaskCount / totalTasks : 0;
  const totalSelectedUploads = verifyUploads.length + qcUploads.length;
  const latestImportTime = overview?.manualMonitoring.latestImport?.importedAt ?? null;

  const overviewStageData: StageDistributionItem[] = PROCESS_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    shortLabel: stage.shortLabel,
    description: stage.description,
    value: overview?.flowStageCounts.find((item) => item.stage === stage.key)?.count ?? 0,
  }));

  const overviewBranches: FlowBranchItem[] = [
    {
      id: "manual",
      label: "需人工介入",
      detail: totalTasks > 0 ? `占比 ${formatPercent(manualRate)}` : "待观察",
      value: manualTaskCount,
      tone: "warning",
    },
    {
      id: "anomaly",
      label: "执行异常",
      detail: totalTasks > 0 ? `占比 ${formatPercent(anomalyRate)}` : "待观察",
      value: anomalyCount,
      tone: "danger",
    },
    {
      id: "qc_rejected",
      label: "质检不通过",
      detail: qcRejectedCount > 0 ? "建议优先复核" : "当前无拦截",
      value: qcRejectedCount,
      tone: qcRejectedCount > 0 ? "danger" : "neutral",
    },
  ];

  const currentPageAlertTags = useMemo<AlertTagItem[]>(() => {
    const tagCounter = new Map<string, AlertTagItem>();
    for (const item of taskList?.items ?? []) {
      for (const alert of buildAlerts(item)) {
        const current = tagCounter.get(alert.label);
        if (current) {
          current.count += 1;
        } else {
          tagCounter.set(alert.label, { label: alert.label, tone: alert.tone, count: 1 });
        }
      }
    }

    return Array.from(tagCounter.values()).sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"),
    );
  }, [taskList]);

  const alertTagCountMap = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of currentPageAlertTags) {
      counter.set(item.label, item.count);
    }
    return counter;
  }, [currentPageAlertTags]);

  return (
    <div className="dashboard-shell min-h-screen text-slate-900">
      <main className="mx-auto flex max-w-[1480px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="reveal-card rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <button
            type="button"
            className="flex w-full flex-col gap-4 text-left md:flex-row md:items-center md:justify-between"
            onClick={() => setUploadExpanded((value) => !value)}
          >
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Upload Console</div>
              <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-950">
                <span className="rounded-2xl bg-slate-950 p-2 text-white">
                  <UploadCloud className="h-5 w-5" />
                </span>
                日志导入
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                已选文件 {formatNumber(totalSelectedUploads)} 个
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                {uploadExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {uploadExpanded ? "收起" : "展开"}
              </span>
            </div>
          </button>

          {uploadExpanded ? (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <UploadZone title="核实日志" phase="verify" items={verifyUploads} onChange={setVerifyUploads} />
                <UploadZone title="质检日志" phase="qc" items={qcUploads} onChange={setQcUploads} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-sm text-slate-600">
                  当前已选择 <span className="font-semibold text-slate-900">{totalSelectedUploads}</span> 个文件
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleClearCache}
                    disabled={loading}
                    title="仅清空日志分析落表数据，不修改 poi_init / poi_verified / poi_qc"
                  >
                    清除日志缓存
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleImport}
                    disabled={importing}
                  >
                    <Database className="h-4 w-4" />
                    {importing ? "处理中..." : "导入并生成结果"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="reveal-card relative overflow-hidden rounded-[32px] border border-white/60 bg-white/78 p-6 shadow-[0_30px_120px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(15,118,110,0.14),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(37,99,235,0.1),_transparent_35%)]" />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-teal-700">
                <Sparkles className="h-3.5 w-3.5" />
                Flow Overview
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500">
                <Database className="h-3.5 w-3.5" />
                最近导入 {formatDateTime(latestImportTime)}
              </span>
            </div>

            <SectionIntro
              eyebrow="Operations Overview"
              title="POI 核实与质检看板"
              description="按全量任务当前所处阶段展示主流程推进情况，先看链路，再看关键指标。"
            />

            <MetroFlowOverview total={totalTasks} stages={overviewStageData} branches={overviewBranches} />

            <div className="grid gap-4 md:grid-cols-3">
              <SpotlightCard
                title="核实自动化率"
                value={formatPercent(overview?.verifyMetrics.automationRate ?? 0)}
                description={`人工介入 ${formatNumber(manualTaskCount)} 条，占比 ${formatPercent(manualRate)}`}
                tone="success"
              />
              <SpotlightCard
                title="核实质量"
                value={formatPercent(overview?.qcMetrics.verificationQualityRate ?? 0)}
                description="已质检样本口径"
                tone="info"
              />
              <SpotlightCard
                title="异常任务"
                value={formatNumber(anomalyCount)}
                description={`占比 ${formatPercent(anomalyRate)}`}
                tone="danger"
              />
            </div>
          </div>
        </section>

        <section className="reveal-card delay-1 relative overflow-visible rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_25px_80px_rgba(15,23,42,0.06)] backdrop-blur">
          <SectionIntro eyebrow="Execution Compare" title="核实与质检横向对比" />
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ExecutionCard title="核实执行概览" metrics={overview?.verifyMetrics} tone="verify" />
            <ExecutionCard title="质检执行概览" metrics={overview?.qcMetrics} tone="qc" />
          </div>
        </section>

        {error ? <div className="reveal-card delay-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <section className="reveal-card delay-3 relative overflow-visible rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_25px_80px_rgba(15,23,42,0.06)] backdrop-blur">
          <SectionIntro eyebrow="Task Flowboard" title="任务详情列表" />

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_190px_190px_190px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white"
                placeholder="搜索 task_id / poi_id / 名称 / 地址"
                value={query.search}
                onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, search: e.target.value }))}
              />
            </label>
            <select
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white"
              value={query.verifyStatus}
              onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, verifyStatus: e.target.value }))}
            >
              <option value="">全部核实状态</option>
              {filterOptions.verifyStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:bg-white"
              value={query.qcStatus}
              onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, qcStatus: e.target.value }))}
            >
              <option value="">全部质检状态</option>
              {filterOptions.qcStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-teal-700"
                  checked={query.manualOnly}
                  onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, manualOnly: e.target.checked }))}
                />
                仅人工任务
              </label>
              <label className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-rose-700"
                  checked={query.anomalyOnly}
                  onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, anomalyOnly: e.target.checked }))}
                />
                仅异常任务
              </label>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Alert Filter</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">异常情况筛选</div>
              </div>
              {query.alertTags.length > 0 ? (
                <button
                  type="button"
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  onClick={() => setQuery((prev) => ({ ...prev, page: 1, alertTags: [] }))}
                >
                  清空异常标签
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ALERT_FILTER_TAGS.map((tag) => {
                const active = query.alertTags.includes(tag.label);
                const count = alertTagCountMap.get(tag.label) ?? 0;
                return (
                  <button
                    key={tag.label}
                    type="button"
                    onClick={() => toggleAlertTag(tag.label)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active ? getActiveTagClasses(tag.tone) : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {tag.label}
                    <span className="ml-1">{formatNumber(count)}条</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loading ? <div className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500">正在刷新列表...</div> : null}
            {!loading && (taskList?.items.length ?? 0) === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500">暂无匹配数据</div> : null}
            {!loading ? (taskList?.items ?? []).map((item, index) => <TaskFlowCard key={item.taskId} item={item} index={index} onOpenLogs={onOpenLogs} />) : null}
          </div>

          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>共 {taskList?.total ?? 0} 条</span>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={query.pageSize}
                onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, pageSize: Number(e.target.value) }))}
              >
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    每页 {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={query.page <= 1}
                onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                上一页
              </button>
              <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
                {query.page} / {totalPages}
              </span>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={query.page >= totalPages}
                onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function MetroFlowOverview({
  total,
  stages,
  branches,
}: {
  total: number;
  stages: StageDistributionItem[];
  branches: FlowBranchItem[];
}) {
  return (
    <article className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(244,247,251,0.92))] p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Metro Flow</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">全量流程执行情况</h2>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600">
          总任务 {formatNumber(total)} 条
        </span>
      </div>

      <div className="mt-5 rounded-[28px] border border-slate-200 bg-white/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="relative hidden md:block">
          <div className="absolute left-[8%] right-[8%] top-5 h-[6px] rounded-full bg-slate-200" />
          <div className="absolute left-[8%] right-[8%] top-5 h-[6px] rounded-full bg-[linear-gradient(90deg,#cbd5e1_0%,#14b8a6_24%,#22c55e_50%,#312e81_78%,#38bdf8_100%)] opacity-80" />
          <div className="grid grid-cols-5 gap-3">
            {stages.map((stage, index) => {
              const theme = getMetroStageTheme(stage.key);
              return (
                <div key={stage.key} className="relative pt-1">
                  <div className="relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                    <span className={`flex h-full w-full items-center justify-center rounded-full border text-sm font-semibold ${theme.badgeClass}`}>
                      {index + 1}
                    </span>
                  </div>
                  <article className={`mt-4 min-h-[196px] rounded-[24px] border p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)] ${theme.cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-inherit/60">阶段 {index + 1}</div>
                        <div className="mt-2 text-xl font-semibold">{stage.shortLabel}</div>
                      </div>
                      <span className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-inherit/80">
                        {total > 0 ? formatPercent(stage.value / total) : "0.00%"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-inherit/80">{stage.description}</p>
                    <div className="mt-6">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-inherit/60">任务量</div>
                      <div className="mt-2 text-3xl font-semibold">{formatNumber(stage.value)}</div>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {stages.map((stage, index) => {
            const theme = getMetroStageTheme(stage.key);
            return (
              <article key={stage.key} className={`rounded-[24px] border p-4 ${theme.cardClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${theme.badgeClass}`}>
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{stage.shortLabel}</div>
                      <div className="mt-1 text-xs text-inherit/70">{stage.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold">{formatNumber(stage.value)}</div>
                    <div className="text-[11px] text-inherit/70">{total > 0 ? formatPercent(stage.value / total) : "0.00%"}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Exception Notes</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">全量异常分支</div>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">辅助观察</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {branches.map((branch) => (
              <StatusPill key={branch.id} label={`${branch.label} ${formatNumber(branch.value)}条`} tone={branch.tone} />
            ))}
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
              {branches.map((branch) => branch.detail).join(" / ")}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function getMetroStageTheme(stage: ProcessStageKey): { cardClass: string; badgeClass: string } {
  if (stage === "pending_verify") {
    return { cardClass: "border-slate-200 bg-white text-slate-700", badgeClass: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  if (stage === "verifying") {
    return { cardClass: "border-teal-200 bg-teal-50 text-teal-900", badgeClass: "border-teal-300 bg-teal-600 text-white" };
  }
  if (stage === "verified_waiting_qc") {
    return { cardClass: "border-emerald-200 bg-emerald-50 text-emerald-900", badgeClass: "border-emerald-300 bg-emerald-600 text-white" };
  }
  if (stage === "qc_running") {
    return { cardClass: "border-indigo-300 bg-indigo-950 text-white", badgeClass: "border-indigo-200 bg-indigo-100 text-indigo-700" };
  }
  return { cardClass: "border-sky-200 bg-sky-50 text-sky-900", badgeClass: "border-sky-300 bg-white text-sky-700" };
}

function getActiveTagClasses(tone: AlertTone): string {
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "info") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}
