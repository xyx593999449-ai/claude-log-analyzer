import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  FileText,
  Info,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  UploadCloud,
  X,
} from "lucide-react";
import { clearCache, fetchFilterOptions, fetchOverview, fetchTaskList, importLogs } from "../../lib/dashboardApi";
import type { DashboardOverview, DashboardTaskItem, FilterOptions, RunView, TaskListResult } from "../../lib/dashboardTypes";

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

type UploadRole = "executor" | "claude" | "unknown";
type UploadPhase = "verify" | "qc";

interface UploadItem {
  id: string;
  file: File;
  role: UploadRole;
}

const GLM_PRICE_INPUT = 4;
const GLM_PRICE_OUTPUT = 18;

function formatDuration(ms: number): string {
  if (!ms) return "0s";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  if (hour > 0) return `${hour}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatCost(value: number): string {
  if (value > 0 && value < 0.0001) return "<¥0.0001";
  return `¥${value.toFixed(4)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function shortText(value: string | null | undefined, max = 28): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function inferRoleByName(name: string): UploadRole {
  const lower = name.toLowerCase();
  if (/(claude|assistant|session|ndjson|trace)/.test(lower)) return "claude";
  if (/(executor|batch|worker|execute|task|result|任务|执行)/.test(lower)) return "executor";
  return "unknown";
}

function inferRoleByContent(content: string): UploadRole {
  const hasClaudeSignals =
    content.includes('"session_id"') &&
    (content.includes('"type":"message"') ||
      content.includes('"type":"content_block_start"') ||
      content.includes('"type":"stream_event"'));

  if (hasClaudeSignals) return "claude";

  const hasExecutorSignals =
    content.includes("task_id") &&
    (content.includes("worker_id") || content.includes("row_number") || content.includes("batch_id"));

  if (hasExecutorSignals) return "executor";
  return "unknown";
}

async function readFileUtf8(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`文件读取失败: ${file.name}`));
        return;
      }
      resolve(reader.result.replace(/^\uFEFF/, ""));
    };
    reader.onerror = () => reject(new Error(`文件读取失败: ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}

function normalizeUploaded(files: FileList | File[] | null): UploadItem[] {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    id: `${file.name}_${file.lastModified}_${Math.random().toString(16).slice(2, 8)}`,
    file,
    role: inferRoleByName(file.name),
  }));
}

function mergeUploads(existing: UploadItem[], incoming: UploadItem[]): UploadItem[] {
  const seen = new Set(existing.map((item) => `${item.file.name}_${item.file.size}_${item.file.lastModified}`));
  const merged = [...existing];
  for (const item of incoming) {
    const key = `${item.file.name}_${item.file.size}_${item.file.lastModified}`;
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  return merged;
}

export function DashboardHome({ onOpenLogs }: DashboardHomeProps) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [taskList, setTaskList] = useState<TaskListResult | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ verifyStatuses: [], qcStatuses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

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
      // handled in function
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
        setError("日志导入成功，但未识别到有效任务。请检查日志格式是否完整。");
      }

      await loadOverviewAndTasks({ ...query, page: 1 });
      setQuery((prev) => ({ ...prev, page: 1 }));
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
      await loadOverviewAndTasks({ ...query, page: 1 });
      setQuery((prev) => ({ ...prev, page: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "清除缓存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/30 to-white text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">大 POI 核实与质检看板</h1>
            <p className="text-sm text-slate-600">首页展示任务概览，支持核实/质检日志批量导入与异常追踪</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            onClick={handleClearCache}
            disabled={loading}
            title="仅清空日志分析落表数据，不修改 poi_init / poi_verified / poi_qc"
          >
            <TimerReset className="h-4 w-4" />
            清除日志缓存
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 p-4 shadow-sm md:grid-cols-2">
          <UploadZone
            title="核实日志上传"
            phase="verify"
            items={verifyUploads}
            onChange={setVerifyUploads}
          />
          <UploadZone
            title="质检日志上传"
            phase="qc"
            items={qcUploads}
            onChange={setQcUploads}
          />

          <div className="md:col-span-2 flex items-center justify-end">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleImport}
              disabled={importing}
            >
              <Database className="h-4 w-4" />
              {importing ? "日志处理中..." : "导入并生成分析结果"}
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
            <h3 className="text-sm font-medium text-sky-800">所有任务</h3>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(overview?.totalTasks ?? 0)}</p>
            <div className="mt-3 space-y-1 text-xs text-slate-600">
              {(overview?.verifyStatusCounts ?? []).slice(0, 6).map((item) => (
                <div className="flex justify-between" key={item.status}>
                  <span className="truncate">{item.status}</span>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          </article>

          <MetricsCard title="已核实任务执行概览" metrics={overview?.verifyMetrics} phase="verify" />
          <MetricsCard title="已质检任务执行概览" metrics={overview?.qcMetrics} phase="qc" />

          <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
            <h3 className="text-sm font-medium text-amber-800">人工任务监控（预留）</h3>
            <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(overview?.manualMonitoring.manualTaskCount ?? 0)} 条</p>
            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <div>异常任务数: {formatNumber(overview?.manualMonitoring.anomalyCount ?? 0)}</div>
              <div>最近导入时间: {overview?.manualMonitoring.latestImport?.importedAt ?? "-"}</div>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm shadow-inner focus:border-indigo-400 focus:outline-none"
              placeholder="搜索 task_id / poi_id / 名称 / 地址"
              value={query.search}
              onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, search: e.target.value }))}
            />
            <select
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
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
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
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
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={query.manualOnly}
                onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, manualOnly: e.target.checked }))}
              />
              仅人工核实任务
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={query.anomalyOnly}
                onChange={(e) => setQuery((prev) => ({ ...prev, page: 1, anomalyOnly: e.target.checked }))}
              />
              仅异常任务
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
                  <th className="px-2 py-2">任务</th>
                  <th className="px-2 py-2">POI 基本信息</th>
                  <th className="px-2 py-2">核实结果</th>
                  <th className="px-2 py-2">核实执行详情</th>
                  <th className="px-2 py-2">质检结果</th>
                  <th className="px-2 py-2">质检执行详情</th>
                  <th className="px-2 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {(taskList?.items ?? []).map((item) => (
                  <TaskRow key={item.taskId} item={item} onOpenLogs={onOpenLogs} />
                ))}
                {!loading && (taskList?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-8 text-center text-zinc-500">
                      暂无匹配数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <div>
              共 {taskList?.total ?? 0} 条
              <select
                className="ml-3 rounded border border-slate-300 bg-slate-50 px-2 py-1"
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
                className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
                disabled={query.page <= 1}
                onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                上一页
              </button>
              <span>
                {query.page} / {totalPages}
              </span>
              <button
                className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
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

function MetricsCard({
  title,
  metrics,
  phase,
}: {
  title: string;
  metrics: DashboardOverview["verifyMetrics"] | undefined;
  phase: "verify" | "qc";
}) {
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${phase === "verify" ? "border-indigo-200 bg-indigo-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
      <h3 className={`text-sm font-medium ${phase === "verify" ? "text-indigo-800" : "text-emerald-800"}`}>{title}</h3>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-lg font-semibold text-slate-900">{formatNumber(metrics?.taskCount ?? 0)} 条</p>
        {phase === "verify" ? (
          <div className="text-right">
            <div className="text-[11px] text-slate-500">自动化率</div>
            <div className="text-lg font-semibold text-indigo-700">{formatPercent(metrics?.automationRate ?? 0)}</div>
          </div>
        ) : null}
        {phase === "qc" ? (
          <div className="text-right">
            <div className="text-[11px] text-slate-500">核实质量</div>
            <div className="text-lg font-semibold text-emerald-700">{formatPercent(metrics?.verificationQualityRate ?? 0)}</div>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <span>总耗时: {formatDuration(metrics?.totalDurationMs ?? 0)}</span>
        <span>平均耗时: {formatDuration(metrics?.avgDurationMs ?? 0)}</span>
        <span>总 Token: {formatNumber(metrics?.totalTokens ?? 0)}</span>
        <span>平均 Token: {formatNumber(metrics?.avgTotalTokens ?? 0)}</span>
        <span>输入 Token(均): {formatNumber(metrics?.avgInputTokens ?? 0)}</span>
        <span>输出 Token(均): {formatNumber(metrics?.avgOutputTokens ?? 0)}</span>
        <span>总成本: {formatCost(metrics?.totalCostUsd ?? 0)}</span>
        <span className="col-span-2 inline-flex items-center gap-1">
          平均成本: {formatCost(metrics?.avgCostUsd ?? 0)}
          <span className="group relative inline-flex">
            <Info className="h-3.5 w-3.5 text-slate-500" />
            <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] leading-snug text-slate-600 shadow group-hover:block">
              按 GLM 定价计算：输入 {GLM_PRICE_INPUT} 元/百万 Token，输出 {GLM_PRICE_OUTPUT} 元/百万 Token
            </span>
          </span>
        </span>
      </div>
    </article>
  );
}

function UploadZone({
  title,
  phase,
  items,
  onChange,
}: {
  title: string;
  phase: UploadPhase;
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function appendFiles(files: FileList | File[] | null): void {
    const nextItems = normalizeUploaded(files);
    onChange(mergeUploads(items, nextItems));
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <UploadCloud className="h-4 w-4" /> {title}
        </div>
        <button
          className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          选择文件
        </button>
      </div>

      <div
        className={`rounded-xl border border-dashed p-4 text-xs ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          appendFiles(e.dataTransfer.files);
        }}
      >
        支持批量拖拽或多选上传，自动识别日志类型（可手动调整）
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => appendFiles(e.target.files)}
      />

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">尚未上传{phase === "verify" ? "核实" : "质检"}日志</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <span className="flex-1 truncate" title={item.file.name}>
                {item.file.name}
              </span>
              <select
                value={item.role}
                onChange={(e) => {
                  const role = e.target.value as UploadRole;
                  onChange(items.map((current) => (current.id === item.id ? { ...current, role } : current)));
                }}
                className="rounded border border-slate-300 bg-white px-1 py-1"
              >
                <option value="unknown">自动识别</option>
                <option value="executor">执行日志</option>
                <option value="claude">Claude 日志</option>
              </select>
              <button
                className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => onChange(items.filter((current) => current.id !== item.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({ item, onOpenLogs }: { item: DashboardTaskItem; onOpenLogs: (taskId: string) => void; key?: string | number }) {
  return (
    <tr className="border-b border-slate-100 align-top odd:bg-white even:bg-slate-50/50 hover:bg-indigo-50/40">
      <td className="px-2 py-3">
        <div className="font-medium text-zinc-900">{shortText(item.taskId, 22)}</div>
        <div className="text-xs text-zinc-500">{item.poiId ?? "-"}</div>
      </td>

      <td className="px-2 py-3">
        <div className="font-medium text-zinc-800">{shortText(item.name, 20)}</div>
        <div className="text-xs text-zinc-500">
          {shortText(item.city, 12)} / {shortText(item.poiType, 12)}
        </div>
        <details className="mt-1 text-xs text-zinc-500">
          <summary className="cursor-pointer text-zinc-600">查看地址</summary>
          <div className="mt-1 max-w-xs break-words">{item.address ?? "-"}</div>
        </details>
      </td>

      <td className="px-2 py-3 text-xs text-zinc-700">
        <div>核实状态: {item.verifiedStatus ?? item.initVerifyStatus ?? "-"}</div>
        <div>核实结果: {shortText(item.verifyResult, 16)}</div>
      </td>

      <td className="px-2 py-3 text-xs text-zinc-700">
        <RunSummary run={item.verifyRun} />
        {item.mismatch.verify ? <MismatchHint message={item.mismatch.verify} /> : null}
      </td>

      <td className="px-2 py-3 text-xs text-zinc-700">
        <div>qc_status: {item.qcStatus ?? "-"}</div>
        <div>quality_status: {item.qualityStatus ?? "-"}</div>
        <div>需人工: {item.isManualRequired ? "是" : "否"}</div>
      </td>

      <td className="px-2 py-3 text-xs text-zinc-700">
        <RunSummary run={item.qcRun} />
        {item.mismatch.qc ? <MismatchHint message={item.mismatch.qc} /> : null}
      </td>

      <td className="px-2 py-3 text-xs">
        <button
          className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100"
          onClick={() => onOpenLogs(item.taskId)}
        >
          日志详情
        </button>
        {item.isManualRequired ? (
          <div className="mt-2 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-amber-700">
            <ShieldAlert className="h-3.5 w-3.5" /> 需人工核实
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> 自动闭环
          </div>
        )}
      </td>
    </tr>
  );
}

function MismatchHint({ message }: { message: string }) {
  return (
    <div className="mt-1 inline-flex items-center gap-1 text-amber-600" title={message}>
      <AlertTriangle className="h-3.5 w-3.5" /> 状态不一致
    </div>
  );
}

function RunSummary({ run }: { run: RunView | null }) {
  if (!run) return <div className="text-zinc-400">暂无执行日志</div>;

  return (
    <>
      <div>执行结论: {run.status ?? "-"}</div>
      <div>开始时间: {run.startedAt ?? "-"}</div>
      <div>结束时间: {run.endedAt ?? "-"}</div>
      <div>耗时: {formatDuration(run.durationMs)}</div>
      <details className="mt-1 text-zinc-500">
        <summary className="cursor-pointer">展开执行细节</summary>
        <div className="mt-1 space-y-1">
          <div>重试次数: {run.retryCount}</div>
          <div>输入 Token: {formatNumber(run.inputTokens)}</div>
          <div>输出 Token: {formatNumber(run.outputTokens)}</div>
          <div>总 Token: {formatNumber(run.totalTokens)}</div>
          <div>成本: {formatCost(run.totalCostUsd)}</div>
          <div>会话数: {run.sessionCount}</div>
          <div>错误摘要: {shortText(run.errorSummary, 40)}</div>
        </div>
      </details>
    </>
  );
}

