import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, ChevronRight, FileDiff, ShieldAlert } from "lucide-react";
import { fetchHitlRegressionDetail, fetchHitlRegressionRuns, fetchHitlRegressionSampleDetail } from "../../lib/dashboardApi";
import type { HitlRegressionDetailResponse, HitlRegressionRunItem, HitlRegressionSampleDetail } from "../../lib/dashboardTypes";
import { buildRegressionDetailModel, formatRatio, type RegressionDiffRow, type RegressionPerspective } from "./hitlRegressionModel";

interface RunQuery {
  runId: string | null;
  datasetName: string | null;
  runAt: string | null;
}

export function HITLRegressionDetailPage() {
  const { batchId = "", regressionType = "verify" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const perspective: RegressionPerspective = regressionType === "qc" ? "qc" : "verify";

  const [runs, setRuns] = useState<HitlRegressionRunItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [detail, setDetail] = useState<HitlRegressionDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sampleDetail, setSampleDetail] = useState<HitlRegressionSampleDetail | null>(null);
  const [sampleDetailLoading, setSampleDetailLoading] = useState(false);

  const queryRun = useMemo<RunQuery>(
    () => ({
      runId: normalizeQueryValue(searchParams.get("runId")),
      datasetName: normalizeQueryValue(searchParams.get("datasetName")),
      runAt: normalizeQueryValue(searchParams.get("runAt")),
    }),
    [searchParams],
  );

  useEffect(() => {
    if (!batchId) {
      setError("缺少批次 ID，无法加载回归详情。");
      return;
    }

    let cancelled = false;
    setLoadingRuns(true);
    fetchHitlRegressionRuns(batchId)
      .then((items) => {
        if (cancelled) return;
        setRuns(items);
        const fallback = items[0] ?? null;
        const currentHasAnyQuery = Boolean(queryRun.runId || queryRun.datasetName || queryRun.runAt);

        if (!currentHasAnyQuery && fallback) {
          syncRunQuery(searchParams, setSearchParams, fallback, true);
          return;
        }

        if (queryRun.runId && (!queryRun.datasetName || !queryRun.runAt)) {
          const matched = items.find((item) => item.runId === queryRun.runId);
          if (matched) {
            syncRunQuery(searchParams, setSearchParams, matched, true);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, queryRun.datasetName, queryRun.runAt, queryRun.runId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!batchId) {
      setError("缺少批次 ID，无法加载回归详情。");
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setError(null);

    fetchHitlRegressionDetail(batchId, perspective, {
      runId: queryRun.runId ?? undefined,
      datasetName: queryRun.datasetName ?? undefined,
      runAt: queryRun.runAt ?? undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        upsertRun(result.header, setRuns);
        syncRunQuery(searchParams, setSearchParams, result.header, true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "回归详情加载失败");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, perspective, queryRun.datasetName, queryRun.runAt, queryRun.runId, searchParams, setSearchParams]);

  const model = useMemo(() => buildRegressionDetailModel(detail, perspective, batchId), [batchId, detail, perspective]);

  const runKey = useMemo(
    () =>
      buildRunKey(queryRun.runId, queryRun.datasetName, queryRun.runAt) ??
      buildRunKey(model.runId, model.datasetName, model.runAt) ??
      "",
    [model.datasetName, model.runAt, model.runId, queryRun.datasetName, queryRun.runAt, queryRun.runId],
  );

  useEffect(() => {
    if (model.rows.length === 0) {
      setSelectedRowId(null);
      return;
    }
    setSelectedRowId((prev) => (prev && model.rows.some((row) => row.id === prev) ? prev : model.rows[0].id));
  }, [model.rows]);

  const selectedRow = useMemo(
    () => model.rows.find((row) => row.id === selectedRowId) ?? model.rows[0] ?? null,
    [model.rows, selectedRowId],
  );

  useEffect(() => {
    if (!batchId || !selectedRow) {
      setSampleDetail(null);
      return;
    }

    let cancelled = false;
    setSampleDetailLoading(true);
    fetchHitlRegressionSampleDetail(batchId, perspective, selectedRow.sampleId, {
      runId: model.runId ?? undefined,
      datasetName: model.datasetName ?? undefined,
      runAt: model.runAt ?? undefined,
      taskId: selectedRow.taskId ?? undefined,
    })
      .then((result) => {
        if (!cancelled) setSampleDetail(result);
      })
      .catch(() => {
        if (!cancelled) setSampleDetail(null);
      })
      .finally(() => {
        if (!cancelled) setSampleDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, model.datasetName, model.runAt, model.runId, perspective, selectedRow]);

  return (
    <div className="dashboard-shell dashboard-grid min-h-[calc(100vh-96px)] rounded-[36px] p-4 text-slate-900 sm:p-6 lg:p-8">
      <section className="reveal-card rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_25px_90px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/hitl-iterations"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 HITL 列表
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ContextPill label="批次" value={batchId || "-"} />
            <ContextPill label="视角" value={perspective === "verify" ? "核实回归" : "质检回归"} />
            <ContextPill label="运行ID" value={model.runId || "暂无"} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">回归详情</div>
            <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight text-slate-950 sm:text-[34px]">{model.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{model.subtitle}，页面严格消费后端 `header / summary / rows` 契约字段。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <HeroMetric title="运行时间" value={model.runAt || "暂无"} />
            <HeroMetric title="样本规模" value={model.sampleCount != null ? String(model.sampleCount) : "-"} />
            <HeroMetric title="当前视角结论" value={model.metricCard.statusText} />
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/75 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">运行选择器</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(2,minmax(0,1fr))]">
            <RunSelector
              runs={runs}
              loading={loadingRuns}
              activeRunKey={runKey}
              onSelect={(nextKey) => {
                const matched = runs.find((item) => buildRunKey(item.runId, item.datasetName, item.runAt) === nextKey);
                if (!matched) return;
                syncRunQuery(searchParams, setSearchParams, matched, false);
              }}
            />
            <HeroMetric title="数据集" value={model.datasetName || "暂无"} />
            <HeroMetric title="runAt" value={model.runAt || "暂无"} />
          </div>
        </div>
      </section>

      {error ? <InlineError text={error} /> : null}
      {loadingDetail ? <InlineInfo text="回归详情加载中..." className="mt-6" /> : null}

      <section className="mt-6 reveal-card delay-1 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">摘要总览</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">三组摘要</h2>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <SummaryGroup title="回归指标" subtitle="逆向率 / 提升率">
            <MetricTile title="逆向率" value={formatRatio(model.summary.metrics.worsenRatio)} tone="worsen" helper="来自 summary.worsenRatio" />
            <MetricTile title="提升率" value={formatRatio(model.summary.metrics.betterRatio)} tone="better" helper="来自 summary.betterRatio" />
          </SummaryGroup>

          <SummaryGroup title="样本构成" subtitle="总 / 正 / 负">
            <MetricTile title="总样本" value={String(model.summary.sampleComposition.totalCount)} tone="neutral" helper="来自 summary.totalCount" />
            <MetricTile title="正样本" value={String(model.summary.sampleComposition.positiveCount)} tone="same" helper="来自 summary.positiveCount" />
            <MetricTile title="负样本" value={String(model.summary.sampleComposition.negativeCount)} tone="worsen" helper="来自 summary.negativeCount" />
          </SummaryGroup>

          <SummaryGroup title="明细统计" subtitle="worsen / better / same / unknown">
            <div className="grid grid-cols-2 gap-3">
              <SummaryBadge label="worsen" value={String(model.summary.detailStats.worsenCount)} tone="worsen" />
              <SummaryBadge label="better" value={String(model.summary.detailStats.betterCount)} tone="better" />
              <SummaryBadge label="same" value={String(model.summary.detailStats.sameCount)} tone="same" />
              <SummaryBadge label="unknown" value={String(model.summary.detailStats.unknownCount)} tone="neutral" />
            </div>
          </SummaryGroup>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <article className="reveal-card delay-1 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">差异列表</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">契约字段明细</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {model.rows.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">当前批次暂无可展示的回归对比明细。</div>
            ) : (
              model.rows.map((row) => {
                const tone = getRowTone(row.diffDirection);
                const selected = row.id === selectedRow?.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRowId(row.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      selected
                        ? "border-teal-200 bg-gradient-to-r from-teal-50/80 via-white to-cyan-50/60 shadow-[0_10px_26px_rgba(15,118,110,0.12)]"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs leading-5 text-slate-700 break-all">{row.taskId || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.sampleType || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400 break-all">{row.poiName || "-"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone.pillClass}`}>{tone.label}</span>
                        <ConsistencyBadge value={row.isConsistent} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <DiffValueCard label="旧值" value={row.primaryOldValue} subtle />
                      <DiffValueCard label="新值" value={row.primaryNewValue} />
                      <DiffValueCard label="次要差异" value={row.secondaryDiffText} subtle />
                    </div>

                    <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700">
                      <span>查看详情</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="reveal-card delay-2 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">样本详情</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">结构化展示</h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
              <FileDiff className="h-5 w-5" />
            </div>
          </div>

          {!selectedRow ? (
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">请选择一条差异样本查看详情。</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-slate-700">{selectedRow.taskId || "-"}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{selectedRow.sampleType || "未标注样本"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getRowTone(selectedRow.diffDirection).pillClass}`}>
                      {getRowTone(selectedRow.diffDirection).label}
                    </span>
                    <ConsistencyBadge value={selectedRow.isConsistent} />
                  </div>
                </div>
              </div>

              {sampleDetailLoading ? <InlineInfo text="样本详情加载中..." /> : null}

              <FieldDiffTable rows={sampleDetail?.fieldDiffs ?? []} />

              <StructuredSection
                title="主次差异"
                icon={<ArrowRightLeft className="h-4 w-4" />}
                rows={[
                  { label: "主差异旧值", value: sampleDetail?.resultDiffs.primary.oldValue ?? selectedRow.primaryOldValue },
                  { label: "主差异新值", value: sampleDetail?.resultDiffs.primary.newValue ?? selectedRow.primaryNewValue },
                  { label: "主差异说明", value: sampleDetail?.resultDiffs.primary.diffText ?? selectedRow.detailPreview },
                  { label: "次差异说明", value: sampleDetail?.resultDiffs.secondary.diffText ?? selectedRow.secondaryDiffText },
                ]}
              />

              <StructuredSection
                title="基础信息"
                icon={<ShieldAlert className="h-4 w-4" />}
                rows={[
                  { label: "POI 名称", value: sampleDetail?.baseInfo.poiName ?? selectedRow.poiName },
                  { label: "地址", value: sampleDetail?.baseInfo.address },
                  { label: "城市", value: sampleDetail?.baseInfo.city },
                  { label: "类型", value: sampleDetail?.baseInfo.poiType },
                  { label: "状态", value: sampleDetail?.baseInfo.status },
                ]}
              />

              <StructuredSection
                title="事实与当前信息"
                icon={<ShieldAlert className="h-4 w-4" />}
                rows={[
                  { label: "truth.name", value: sampleDetail?.truthInfo.name },
                  { label: "truth.address", value: sampleDetail?.truthInfo.address },
                  { label: "current.verifyResult", value: sampleDetail?.currentInfo.verifyResult },
                  { label: "current.qcStatus", value: sampleDetail?.currentInfo.qcStatus },
                  { label: "verified.name", value: sampleDetail?.verifiedInfo.name },
                  { label: "verified.address", value: sampleDetail?.verifiedInfo.address },
                ]}
              />

              <details className="rounded-[22px] border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">查看 Raw JSON（折叠）</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                  {JSON.stringify(sampleDetail ?? selectedRow.raw, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function SummaryGroup({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white/85 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{subtitle}</div>
      <div className="mt-3 grid gap-3">{children}</div>
    </article>
  );
}

function RunSelector({
  runs,
  loading,
  activeRunKey,
  onSelect,
}: {
  runs: HitlRegressionRunItem[];
  loading: boolean;
  activeRunKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">运行（datasetName + runAt）</div>
      <select
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
        value={activeRunKey}
        disabled={loading || runs.length === 0}
        onChange={(event) => onSelect(event.target.value)}
      >
        {runs.length === 0 ? <option value="">暂无运行数据</option> : null}
        {runs.map((run) => {
          const key = buildRunKey(run.runId, run.datasetName, run.runAt) ?? "";
          return (
            <option key={key} value={key}>
              {`${run.datasetName || "未命名数据集"} | ${run.runAt || "未提供 runAt"}`}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function FieldDiffTable({ rows }: { rows: HitlRegressionSampleDetail["fieldDiffs"] }) {
  const changedCount = rows.filter((row) => isDiffChanged(row.oldValue, row.newValue)).length;
  return (
    <div className="rounded-[22px] border border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white to-orange-50/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500">字段差异（重点）</div>
        <span className="inline-flex rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
          变化 {changedCount} / {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 text-sm text-slate-500">当前样本暂无字段级差异。</div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[18px] border border-rose-200/70 bg-white">
          <div className="grid grid-cols-[140px_1fr_1fr] gap-2 border-b border-rose-200/70 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-600">
            <div>字段</div>
            <div>旧值</div>
            <div>新值</div>
          </div>
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className={`grid grid-cols-[140px_1fr_1fr] gap-2 border-b px-3 py-2 text-sm last:border-b-0 ${
                isDiffChanged(row.oldValue, row.newValue) ? "border-rose-200/70 bg-rose-50/45 text-slate-800" : "border-slate-200 text-slate-700"
              }`}
            >
              <div className="font-medium">{row.label}</div>
              <div className="break-all">{formatDisplayValue(row.oldValue)}</div>
              <div className="break-all">{formatDisplayValue(row.newValue)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StructuredSection({ title, icon, rows }: { title: string; icon: ReactNode; rows: Array<{ label: string; value: unknown }> }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {icon}
        {title}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</div>
            <div className="mt-1 text-sm leading-6 text-slate-700">{formatDisplayValue(item.value)}</div>
          </div>
        ))}
      </div>
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

function MetricTile({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: string;
  helper: string;
  tone: "better" | "worsen" | "same" | "neutral";
}) {
  const toneMap = {
    better: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
    worsen: "border-rose-200 bg-rose-50/70 text-rose-700",
    same: "border-sky-200 bg-sky-50/70 text-sky-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;
  return (
    <div className={`rounded-[22px] border p-4 ${toneMap[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{title}</div>
      <div className="mt-2 text-xl font-semibold leading-none">{value}</div>
      <div className="mt-2 text-xs opacity-80">{helper}</div>
    </div>
  );
}

function SummaryBadge({ label, value, tone }: { label: string; value: string; tone: "better" | "worsen" | "same" | "neutral" }) {
  const styles = {
    better: "border-emerald-200 bg-emerald-50 text-emerald-700",
    worsen: "border-rose-200 bg-rose-50 text-rose-700",
    same: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;
  return (
    <div className={`rounded-[18px] border px-3 py-2 ${styles[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none">{value}</div>
    </div>
  );
}

function DiffValueCard({ label, value, subtle = false }: { label: string; value: string | null; subtle?: boolean }) {
  return (
    <div className={`rounded-[18px] border p-3 ${subtle ? "border-slate-200 bg-slate-50/80" : "border-teal-200 bg-teal-50/40"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-800">{value || "-"}</div>
    </div>
  );
}

function ConsistencyBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">一致</span>;
  }
  if (value === false) {
    return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">不一致</span>;
  }
  return <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">未知</span>;
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </span>
  );
}

function InlineInfo({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 ${className}`}>{text}</div>;
}

function InlineError({ text }: { text: string }) {
  return <div className="mt-6 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{text}</div>;
}

function normalizeQueryValue(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized || null;
}

function buildRunKey(runId: string | null, datasetName: string | null, runAt: string | null): string | null {
  const normalizedRunId = normalizeQueryValue(runId);
  const normalizedDataset = normalizeQueryValue(datasetName);
  const normalizedRunAt = normalizeQueryValue(runAt);
  if (normalizedRunId) return `id:${normalizedRunId}`;
  if (normalizedDataset || normalizedRunAt) return `legacy:${normalizedDataset ?? ""}::${normalizedRunAt ?? ""}`;
  return null;
}

function formatDisplayValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isDiffChanged(oldValue: unknown, newValue: unknown): boolean {
  const left = formatDisplayValue(oldValue);
  const right = formatDisplayValue(newValue);
  return left !== right;
}

function getRowTone(direction: RegressionDiffRow["diffDirection"]): { label: string; pillClass: string } {
  if (direction === "better") {
    return { label: "better", pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (direction === "worsen") {
    return { label: "worsen", pillClass: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  if (direction === "same") {
    return { label: "same", pillClass: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  return { label: "unknown", pillClass: "border-amber-200 bg-amber-50 text-amber-700" };
}

function syncRunQuery(
  searchParams: URLSearchParams,
  setSearchParams: (nextInit: URLSearchParams, navigateOpts?: { replace?: boolean }) => void,
  run: { runId: string | null; datasetName: string | null; runAt: string | null },
  replace: boolean,
): void {
  const next = new URLSearchParams(searchParams);
  if (run.runId) next.set("runId", run.runId);
  else next.delete("runId");

  if (run.datasetName) next.set("datasetName", run.datasetName);
  else next.delete("datasetName");

  if (run.runAt) next.set("runAt", run.runAt);
  else next.delete("runAt");

  if (next.toString() !== searchParams.toString()) {
    setSearchParams(next, { replace });
  }
}

function upsertRun(
  header: HitlRegressionDetailResponse["header"],
  setRuns: Dispatch<SetStateAction<HitlRegressionRunItem[]>>,
): void {
  setRuns((prev) => {
    const key = buildRunKey(header.runId, header.datasetName, header.runAt);
    if (!key) return prev;
    if (prev.some((item) => buildRunKey(item.runId, item.datasetName, item.runAt) === key)) return prev;
    const nextItem: HitlRegressionRunItem = {
      batchId: header.batchId,
      datasetName: header.datasetName,
      runAt: header.runAt,
      runId: header.runId,
      totalCount: header.totalCount,
      positiveCount: 0,
      negativeCount: 0,
      verifyBetterRatio: null,
      verifyWorsenRatio: null,
      qcBetterRatio: null,
      qcWorsenRatio: null,
    };
    return [nextItem, ...prev];
  });
}
