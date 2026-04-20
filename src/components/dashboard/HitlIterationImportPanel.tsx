import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { DashboardApiError, importHitlBatch, previewHitlBatchImport } from "../../lib/dashboardApi";
import type {
  HitlBatchImportCommitResult,
  HitlBatchImportErrorDetail,
  HitlBatchImportPreviewResponse,
} from "../../lib/dashboardTypes";

const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const PREVIEW_COLUMN_PRIORITY = [
  "id",
  "task_id",
  "name_chn",
  "addr_chn",
  "poi_type",
  "city",
  "verify_result",
  "qc_status",
  "verify_content_is_correct",
  "verify_action_is_correct",
  "qc_intercept_is_correct",
  "evidence_status",
  "issue_observation_tags",
  "judgment_dimension_tags",
  "manual_comment",
] as const;

interface HitlIterationImportPanelProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: HitlBatchImportCommitResult) => Promise<void> | void;
}

interface ImportErrorState {
  message: string;
  details: HitlBatchImportErrorDetail[];
}

export function HitlIterationImportPanel({ open, onClose, onImported }: HitlIterationImportPanelProps) {
  const [batchId, setBatchId] = useState("");
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<HitlBatchImportPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorState, setErrorState] = useState<ImportErrorState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewColumns = useMemo(() => getPreviewColumns(preview), [preview]);

  useEffect(() => {
    if (!open) return;
    resetPanel();
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function resetPanel() {
    setBatchId("");
    setSummary("");
    setSource("");
    setFile(null);
    setDragging(false);
    setPreview(null);
    setPreviewing(false);
    setImporting(false);
    setErrorState(null);
  }

  function invalidatePreview() {
    setPreview(null);
    setErrorState(null);
  }

  function pickFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setErrorState(null);
  }

  function formatClientValidationError(): string | null {
    if (!batchId.trim()) return "请先填写 batch_id。";
    if (!BATCH_ID_PATTERN.test(batchId.trim())) return "batch_id 仅支持 3-64 位字母、数字、下划线或短横线。";
    if (!file) return "请上传待导入的 CSV 文件。";
    if (!file.name.toLowerCase().endsWith(".csv")) return "当前仅支持 CSV 文件。";
    return null;
  }

  async function handlePreview() {
    const validationError = formatClientValidationError();
    if (validationError) {
      setErrorState({ message: validationError, details: [] });
      return;
    }

    if (!file) return;

    setPreviewing(true);
    setErrorState(null);
    setPreview(null);
    try {
      const response = await previewHitlBatchImport({
        batchId: batchId.trim(),
        summary,
        source,
        file,
      });
      setPreview(response);
    } catch (error: unknown) {
      setPreview(null);
      setErrorState(normalizeImportError(error, "预览校验失败，请检查文件内容后重试。"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!preview?.previewToken) {
      setErrorState({ message: "请先完成校验并预览。", details: [] });
      return;
    }

    setImporting(true);
    setErrorState(null);
    try {
      const result = await importHitlBatch({ previewToken: preview.previewToken });
      await onImported(result);
      onClose();
    } catch (error: unknown) {
      setErrorState(normalizeImportError(error, "导入失败，请稍后重试。"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(15,23,42,0.18)] backdrop-blur-[3px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="新建迭代批次"
        className="ide-scrollbar h-full w-full max-w-[720px] overflow-y-auto border-l border-white/70 bg-[linear-gradient(180deg,rgba(252,249,243,0.97)_0%,rgba(247,243,235,0.98)_46%,rgba(255,255,255,0.98)_100%)] shadow-[-20px_0_80px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden px-5 pb-8 pt-5 sm:px-7">
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.18),transparent_52%),linear-gradient(90deg,rgba(15,23,42,0.06),transparent)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  Import Workbench
                </div>
                <h2 className="mt-4 font-display text-[28px] font-semibold leading-tight text-slate-950 sm:text-[32px]">新建迭代批次</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  先完成批次编号与文件规格校验，只有通过后才进入局部预览与最终导入确认。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/85 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                aria-label="关闭导入面板"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_22px_58px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">批次元信息</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">导入上下文</div>
                  </div>
                  <StatusChip label="必填校验先行" tone="neutral" />
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>batch_id</span>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700">
                        Required
                      </span>
                    </div>
                    <input
                      value={batchId}
                      onChange={(event) => {
                        setBatchId(event.target.value);
                        invalidatePreview();
                      }}
                      placeholder="例如 batch_20260420_manual_v1"
                      className="w-full rounded-[20px] border border-slate-200 bg-[rgba(250,248,243,0.95)] px-4 py-3 font-mono text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100"
                    />
                    <div className="mt-2 text-xs leading-5 text-slate-500">只允许字母、数字、下划线与短横线，长度 3-64。</div>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-800">summary</div>
                      <input
                        value={summary}
                        onChange={(event) => {
                          setSummary(event.target.value);
                          invalidatePreview();
                        }}
                        placeholder="可选，用于预览摘要"
                        className="w-full rounded-[20px] border border-slate-200 bg-[rgba(250,248,243,0.95)] px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-800">source</div>
                      <input
                        value={source}
                        onChange={(event) => {
                          setSource(event.target.value);
                          invalidatePreview();
                        }}
                        placeholder="可选，记录标注来源"
                        className="w-full rounded-[20px] border border-slate-200 bg-[rgba(250,248,243,0.95)] px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(241,245,249,0.86)_100%)] p-5 shadow-[0_22px_58px_rgba(15,23,42,0.06)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">上传规格</div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                  <SpecRow label="文件格式" value="仅支持 CSV" />
                  <SpecRow label="编码要求" value="UTF-8 无 BOM" />
                  <SpecRow label="重复批次" value="同一 batch_id 不允许重复导入" />
                  <SpecRow label="错误处理" value="校验失败直接报错，不进入预览" />
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_22px_58px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">文件工作台</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">拖拽上传或点击选取</div>
                </div>
                <StatusChip label={preview ? "预览已就绪" : "等待校验"} tone={preview ? "success" : "neutral"} />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  pickFile(event.target.files?.[0] ?? null);
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pickFile(event.dataTransfer.files?.[0] ?? null);
                }}
                className={`mt-5 w-full rounded-[28px] border border-dashed px-5 py-8 text-left transition ${
                  dragging
                    ? "border-teal-300 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,254,255,0.94)_100%)] shadow-[0_18px_40px_rgba(20,184,166,0.12)]"
                    : file
                      ? "border-slate-300 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.96)_100%)]"
                      : "border-slate-300 bg-[linear-gradient(135deg,rgba(250,248,243,0.96)_0%,rgba(248,250,252,0.96)_100%)] hover:border-slate-400 hover:bg-white"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-[18px] border ${file ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-500"}`}>
                      {file ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-950">{file ? file.name : "把人工标注 CSV 拖到这里"}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">
                        {file ? `${formatFileSize(file.size)} · ${file.type || "text/csv"}` : "也可以点击面板，从本地选择文件。"}
                      </div>
                      <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">CSV only · UTF-8 without BOM</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                    {file ? "更换文件" : "选择文件"}
                  </span>
                </div>
              </button>

              {errorState ? (
                <div className="mt-4 rounded-[24px] border border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.95)_0%,rgba(255,251,235,0.94)_100%)] p-4 text-rose-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{errorState.message}</div>
                      {errorState.details.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {errorState.details.slice(0, 6).map((detail, index) => (
                            <div key={`${detail.rowNumber ?? "global"}-${detail.field ?? "message"}-${index}`} className="rounded-2xl border border-rose-200/80 bg-white/70 px-3 py-2 text-sm leading-6 text-rose-900">
                              <span className="font-semibold">{formatErrorPrefix(detail)}</span>
                              {detail.message}
                            </div>
                          ))}
                          {errorState.details.length > 6 ? (
                            <div className="text-xs text-rose-700">其余 {errorState.details.length - 6} 条错误请修正后重新校验。</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {preview ? (
                <div className="mt-4 rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.95)_100%)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Preview Ready
                      </div>
                      <div className="mt-3 text-lg font-semibold text-slate-950">校验通过，可以确认导入</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">以下展示的是局部数据预览，正式导入会基于本次预览生成的令牌提交。</p>
                    </div>
                    <StatusChip label={`${preview.validRows} 条可导入`} tone="success" />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <PreviewMetric title="batch_id" value={preview.batchId} mono />
                    <PreviewMetric title="文件名" value={preview.fileName} />
                    <PreviewMetric title="总记录数" value={String(preview.totalRows)} />
                    <PreviewMetric title="字段数" value={String(preview.columns.length)} />
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[22px] border border-emerald-200/80 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">局部数据预览</div>
                        <div className="mt-1 text-xs text-slate-500">展示优先字段，帮助确认上传内容与列映射是否符合预期。</div>
                      </div>
                      <div className="text-xs font-medium text-slate-500">预览 {preview.previewRows.length} 行</div>
                    </div>
                    <div className="ide-scrollbar overflow-auto">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead className="bg-white">
                          <tr>
                            {previewColumns.map((column) => (
                              <th key={column} className="border-b border-slate-200 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.previewRows.map((row, rowIndex) => (
                            <tr key={`preview-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50/55">
                              {previewColumns.map((column) => (
                                <td key={`${rowIndex}-${column}`} className="max-w-[220px] border-b border-slate-100 px-4 py-3 align-top text-slate-700">
                                  <div className={column === "id" || column === "task_id" ? "font-mono text-xs" : "leading-6"}>
                                    {row.values[column] || <span className="text-slate-300">-</span>}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs leading-5 text-slate-500">
                  校验失败不会进入预览区。若更改 `batch_id`、摘要、来源或文件，请重新执行预览校验。
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewing || importing}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-900 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-300"
                  >
                    {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {preview ? "重新校验预览" : "校验并预览"}
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={!preview || previewing || importing}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-5 py-2.5 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    确认导入
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

function normalizeImportError(error: unknown, fallback: string): ImportErrorState {
  if (error instanceof DashboardApiError) {
    return {
      message: error.message || fallback,
      details: error.details ?? [],
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      details: [],
    };
  }
  return {
    message: fallback,
    details: [],
  };
}

function formatErrorPrefix(detail: HitlBatchImportErrorDetail): string {
  const segments: string[] = [];
  if (typeof detail.rowNumber === "number") segments.push(`第 ${detail.rowNumber} 行`);
  if (detail.field) segments.push(`${detail.field}`);
  return segments.length > 0 ? `${segments.join(" · ")}：` : "";
}

function getPreviewColumns(preview: HitlBatchImportPreviewResponse | null): string[] {
  if (!preview) return [];
  const columns = preview.columns ?? [];
  const ordered = [
    ...PREVIEW_COLUMN_PRIORITY.filter((column) => columns.includes(column)),
    ...columns.filter((column) => !PREVIEW_COLUMN_PRIORITY.includes(column as (typeof PREVIEW_COLUMN_PRIORITY)[number])),
  ];
  return ordered.slice(0, 8);
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewMetric({ title, value, mono = false }: { title: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[18px] border border-emerald-100 bg-white/88 p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className={`mt-2 text-sm font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/70 bg-white/78 px-3 py-2.5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "neutral" | "success" }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}
