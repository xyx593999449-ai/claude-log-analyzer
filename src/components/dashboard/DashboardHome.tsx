import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, Search, Sparkles, UploadCloud } from "lucide-react";
import { clearCache, fetchFilterOptions, fetchOverview, fetchTaskList, importLogs } from "../../lib/dashboardApi";
import type { DashboardOverview, FilterOptions, TaskListResult } from "../../lib/dashboardTypes";
import { TaskFlowCard } from "./TaskFlowCard";
import {
  PROCESS_STAGES,
  buildAlerts,
  formatDateTime,
  formatNumber,
  formatPercent,
  getProcessStage,
  inferRoleByContent,
  readFileUtf8,
  type AlertTone,
  type ProcessStageKey,
  type UploadItem,
} from "./dashboardModel";
import {
  AttentionRow,
  ExecutionCard,
  SectionIntro,
  SpotlightCard,
  StatusPill,
  UploadZone,
} from "./dashboardWidgets";

interface DashboardHomeProps {
  onOpenLogs: (taskId: string) => void;
}

interface QueryState {
  page: number;
  pageSize: number;
  search: string;
  verifyStatus: string;
  qcStatus: string;
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

  async function buildPhasePayload(items: UploadItem[]): Promise<{ executor?: string; claude?: string }> {
    const executorLogs: string[] = [];
    const claudeLogs: string[] = [];

    for (const item of items) {
      const text = await readFileUtf8(item.file);
      const role = item.role === "unknown" ? inferRoleByContent(text) : item.role;
      if (role === "claude") {
        claudeLogs.push(text);
      } else {
        executorLogs.push(text);
      }
    }

    return {
      executor: executorLogs.length ? executorLogs.join("\n") : undefined,
      claude: claudeLogs.length ? claudeLogs.join("\n") : undefined,
    };
  }

  async function handleImport(): Promise<void> {
    setImporting(true);
    setError("");

    try {
      if (verifyUploads.length === 0 && qcUploads.length === 0) {
        throw new Error("请先上传核实或质检日志文件");
      }

      const [verifyPayload, qcPayload] = await Promise.all([
        buildPhasePayload(verifyUploads),
        buildPhasePayload(qcUploads),
      ]);

      const result = await importLogs({
        source: "manual_upload",
        verifyExecutorLog: verifyPayload.executor,
        verifyClaudeLog: verifyPayload.claude,
        qcExecutorLog: qcPayload.executor,
        qcClaudeLog: qcPayload.claude,
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

  const totalTasks = overview?.totalTasks ?? 0;
  const manualTaskCount = overview?.manualMonitoring.manualTaskCount ?? 0;
  const anomalyCount = overview?.manualMonitoring.anomalyCount ?? 0;
  const anomalyRate = totalTasks > 0 ? anomalyCount / totalTasks : 0;
  const manualRate = totalTasks > 0 ? manualTaskCount / totalTasks : 0;
  const totalSelectedUploads = verifyUploads.length + qcUploads.length;
  const latestImportTime = overview?.manualMonitoring.latestImport?.importedAt ?? null;

  const currentPageStageData: StageDistributionItem[] = PROCESS_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    shortLabel: stage.shortLabel,
    description: stage.description,
    value: (taskList?.items ?? []).filter((item) => getProcessStage(item).key === stage.key).length,
  }));

  const currentPageTotal = taskList?.items.length ?? 0;
  const currentPageAnomalyCount = (taskList?.items ?? []).filter((item) => buildAlerts(item).length > 0).length;
  const currentPageAlertTags = useMemo<AlertTagItem[]>(() => {
    const tagCounter = new Map<string, AlertTagItem>();

    for (const item of taskList?.items ?? []) {
      for (const alert of buildAlerts(item)) {
        const current = tagCounter.get(alert.label);
        if (current) {
          current.count += 1;
        } else {
          tagCounter.set(alert.label, {
            label: alert.label,
            tone: alert.tone,
            count: 1,
          });
        }
      }
    }

    return Array.from(tagCounter.values()).sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"),
    );
  }, [taskList]);

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

        <section className="reveal-card dashboard-grid relative overflow-hidden rounded-[32px] border border-white/60 bg-white/78 p-6 shadow-[0_30px_120px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.18),_transparent_60%)] lg:block" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-teal-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Verification Ops
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500">
                  <Database className="h-3.5 w-3.5" />
                  最近导入 {formatDateTime(latestImportTime)}
                </span>
              </div>

              <div className="max-w-4xl">
                <h1 className="font-display text-3xl font-semibold leading-tight text-slate-950 md:text-5xl">
                  POI 核实与质检看板
                </h1>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SpotlightCard title="任务总量" value={formatNumber(totalTasks)} description="当前样本池" tone="neutral" />
                <SpotlightCard title="核实自动化率" value={formatPercent(overview?.verifyMetrics.automationRate ?? 0)} description={`人工介入 ${formatNumber(manualTaskCount)} 条`} tone="success" />
                <SpotlightCard title="核实质量" value={formatPercent(overview?.qcMetrics.verificationQualityRate ?? 0)} description="已质检样本口径" tone="info" />
                <SpotlightCard title="异常任务" value={formatNumber(anomalyCount)} description={`占比 ${formatPercent(anomalyRate)}`} tone="danger" />
              </div>
            </div>

            <div className="space-y-4">
              <article className="rounded-[28px] border border-slate-200/70 bg-slate-950 p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,0.25)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.26em] text-teal-200/90">重点关注</p>
                    <h2 className="mt-2 text-xl font-semibold">异常与人工介入</h2>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-100">优先跟进</div>
                </div>
                <div className="mt-5 space-y-3">
                  <AttentionRow label="需人工介入" value={`${formatNumber(manualTaskCount)} 条`} tone="warning" detail={`占比 ${formatPercent(manualRate)}`} />
                  <AttentionRow label="异常任务" value={`${formatNumber(anomalyCount)} 条`} tone="danger" detail={`占比 ${formatPercent(anomalyRate)}`} />
                  <AttentionRow label="核实闭环" value={formatPercent(overview?.verifyMetrics.automationRate ?? 0)} tone="success" detail="核实口径" />
                  <AttentionRow label="质检质量" value={formatPercent(overview?.qcMetrics.verificationQualityRate ?? 0)} tone="info" detail="质检口径" />
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="reveal-card delay-1 rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_25px_80px_rgba(15,23,42,0.06)] backdrop-blur">
          <SectionIntro eyebrow="Execution Compare" title="核实与质检横向对比" />
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ExecutionCard title="核实执行概览" metrics={overview?.verifyMetrics} tone="verify" />
            <ExecutionCard title="质检执行概览" metrics={overview?.qcMetrics} tone="qc" />
          </div>
        </section>

        {error ? <div className="reveal-card delay-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <section className="reveal-card delay-3 rounded-[28px] border border-white/70 bg-white/84 p-5 shadow-[0_25px_80px_rgba(15,23,42,0.06)] backdrop-blur">
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

          <div className="mt-5 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">当前页流程分布</h3>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                  当前页 {formatNumber(currentPageTotal)} 条
                </span>
              </div>
              <StageDistributionBoard stages={currentPageStageData} total={currentPageTotal} />
            </div>

            <AlertTagBoard total={currentPageTotal} anomalyCount={currentPageAnomalyCount} tags={currentPageAlertTags} />
          </div>

          <div className="mt-6 space-y-4">
            {loading ? <div className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500">正在刷新列表...</div> : null}
            {!loading && currentPageTotal === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500">暂无匹配数据</div> : null}
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

function StageDistributionBoard({
  stages,
  total,
}: {
  stages: StageDistributionItem[];
  total: number;
}) {
  return (
    <div className="relative rounded-3xl border border-slate-200 bg-white px-4 py-5">
      <div className="absolute left-10 right-10 top-10 hidden border-t border-dashed border-slate-300 md:block" />
      <div className="grid gap-3 md:grid-cols-5">
        {stages.map((stage) => {
          const theme = getStageDistributionTheme(stage.key);
          return (
            <article key={stage.key} className={`rounded-2xl border px-3 py-3 ${theme.cardClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${theme.badgeClass}`}>
                  {stage.value}
                </div>
                <div className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-inherit/80">
                  {total > 0 ? formatPercent(stage.value / total) : "0.00%"}
                </div>
              </div>
              <div className="mt-3">
                <div className="text-sm font-semibold">{stage.shortLabel}</div>
                <div className="mt-1 text-xs leading-5 text-inherit/80">{stage.description}</div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-inherit/60">任务量</div>
                <div className="text-2xl font-semibold">{formatNumber(stage.value)}</div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AlertTagBoard({
  total,
  anomalyCount,
  tags,
}: {
  total: number;
  anomalyCount: number;
  tags: AlertTagItem[];
}) {
  return (
    <aside className="rounded-3xl border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-rose-400">Current Alerts</div>
          <h3 className="mt-2 text-sm font-semibold text-slate-900">当前页异常标记</h3>
          <p className="mt-2 text-xs text-slate-500">
            异常任务 {formatNumber(anomalyCount)} / {formatNumber(total || 0)}
          </p>
        </div>
        <span className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600">
          {total > 0 ? formatPercent(anomalyCount / total) : "0.00%"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length === 0 ? <StatusPill label="无异常标记" tone="success" /> : null}
        {tags.map((tag) => (
          <StatusPill key={tag.label} label={`${tag.label} ${formatNumber(tag.count)}条`} tone={tag.tone} />
        ))}
      </div>
    </aside>
  );
}

function getStageDistributionTheme(stage: ProcessStageKey): {
  cardClass: string;
  badgeClass: string;
} {
  if (stage === "pending_verify") {
    return {
      cardClass: "border-slate-200 bg-white text-slate-600",
      badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
    };
  }

  if (stage === "verifying") {
    return {
      cardClass: "border-teal-200 bg-teal-50 text-teal-800",
      badgeClass: "border-teal-300 bg-teal-600 text-white",
    };
  }

  if (stage === "verified_waiting_qc") {
    return {
      cardClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      badgeClass: "border-emerald-300 bg-emerald-600 text-white",
    };
  }

  if (stage === "qc_running") {
    return {
      cardClass: "border-indigo-300 bg-indigo-950 text-white",
      badgeClass: "border-indigo-200 bg-indigo-100 text-indigo-700",
    };
  }

  return {
    cardClass: "border-sky-200 bg-sky-50 text-sky-800",
    badgeClass: "border-sky-300 bg-white text-sky-700",
  };
}
