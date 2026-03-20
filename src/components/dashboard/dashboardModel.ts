import type { DashboardTaskItem, RunView } from "../../lib/dashboardTypes";

export type UploadRole = "executor" | "claude" | "unknown";
export type UploadPhase = "verify" | "qc";
export type AlertTone = "neutral" | "success" | "info" | "warning" | "danger";

export type ProcessStageKey =
  | "pending_verify"
  | "verifying"
  | "verified_waiting_qc"
  | "qc_running"
  | "qc_done";

export interface UploadItem {
  id: string;
  file: File;
  role: UploadRole;
}

export interface FlowAlert {
  label: string;
  detail: string;
  tone: AlertTone;
}

export interface ProcessStageMeta {
  key: ProcessStageKey;
  label: string;
  shortLabel: string;
  description: string;
}

export const GLM_PRICE_INPUT = 4;
export const GLM_PRICE_OUTPUT = 18;

export const PROCESS_STAGES: ProcessStageMeta[] = [
  { key: "pending_verify", label: "待核实", shortLabel: "待核实", description: "尚未进入核实流程" },
  { key: "verifying", label: "核实中", shortLabel: "核实中", description: "核实执行中或等待重试" },
  { key: "verified_waiting_qc", label: "核实完成待质检", shortLabel: "待质检", description: "核实结果已产出" },
  { key: "qc_running", label: "质检中", shortLabel: "质检中", description: "质检执行中或待复核" },
  { key: "qc_done", label: "质检完成", shortLabel: "已质检", description: "质检结论已回写" },
];

export const PIE_COLORS = ["#0f766e", "#d97706", "#2563eb", "#e11d48", "#7c3aed", "#475569"];

export function formatDuration(ms: number): string {
  if (!ms) return "0s";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  if (hour > 0) return `${hour}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatCost(value: number): string {
  if (value > 0 && value < 0.0001) return "<¥0.0001";
  return `¥${value.toFixed(4)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function shortText(value: string | null | undefined, max = 28): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function inferRoleByName(name: string): UploadRole {
  const lower = name.toLowerCase();
  if (/(claude|assistant|session|ndjson|trace)/.test(lower)) return "claude";
  if (/(executor|batch|worker|execute|task|result|verify|qc|任务|执行)/.test(lower)) return "executor";
  return "unknown";
}

export function inferRoleByContent(content: string): UploadRole {
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

export function getRunTone(run: RunView | null): AlertTone {
  if (!run) return "neutral";
  if (run.status === "success") return "success";
  return "danger";
}

export function getProcessStage(item: DashboardTaskItem): ProcessStageMeta {
  const verifyCompleted = item.verifyRun?.status === "success" || Boolean(item.verifiedStatus) || Boolean(item.verifyResult);
  const qcCompleted =
    item.qcSummary.isQualified !== null || item.qualityStatus === "已质检" || Boolean(item.qcStatus);
  const qcAttempted = Boolean(item.qcRun) || item.qualityStatus === "质检中";

  if (qcCompleted) return PROCESS_STAGES[4];
  if (qcAttempted) return PROCESS_STAGES[3];
  if (verifyCompleted) return PROCESS_STAGES[2];
  if (item.verifyRun) return PROCESS_STAGES[1];
  return PROCESS_STAGES[0];
}

export function getStageIndex(stage: ProcessStageKey): number {
  return PROCESS_STAGES.findIndex((item) => item.key === stage);
}

export function getStageTone(stage: ProcessStageKey): AlertTone {
  if (stage === "qc_done") return "success";
  if (stage === "qc_running" || stage === "verifying") return "info";
  return "neutral";
}

export function getStatusClasses(tone: AlertTone): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function isBlockingRunIssue(run: RunView | null | undefined): boolean {
  return (run?.retryCount ?? 0) > 5;
}

export function buildAlerts(item: DashboardTaskItem): FlowAlert[] {
  const alerts: FlowAlert[] = [];

  if (isBlockingRunIssue(item.verifyRun)) {
    alerts.push({
      label: "核实阻塞异常",
      detail: `核实流程重试 ${item.verifyRun?.retryCount ?? 0} 次，已超过阻塞阈值`,
      tone: "danger",
    });
  } else if (item.verifyRun && item.verifyRun.status !== "success") {
    alerts.push({
      label: "核实执行异常",
      detail: item.verifyRun.errorSummary || `核实执行状态为 ${item.verifyRun.status ?? "unknown"}`,
      tone: "warning",
    });
  }

  if (isBlockingRunIssue(item.qcRun)) {
    alerts.push({
      label: "质检阻塞异常",
      detail: `质检流程重试 ${item.qcRun?.retryCount ?? 0} 次，已超过阻塞阈值`,
      tone: "danger",
    });
  } else if (item.qcRun && item.qcRun.status !== "success") {
    alerts.push({
      label: "质检执行异常",
      detail: item.qcRun.errorSummary || `质检执行状态为 ${item.qcRun.status ?? "unknown"}`,
      tone: "warning",
    });
  }

  if (item.isManualRequired || item.verifyResult === "需人工核实") {
    alerts.push({
      label: "需人工介入",
      detail: "当前任务需要人工补充判断或复核。",
      tone: "warning",
    });
  }

  if (item.qcSummary.isQualified === false) {
    alerts.push({
      label: "质检不通过",
      detail: `质检评分 ${item.qcSummary.qcScore ?? "-"}`,
      tone: "danger",
    });
  }

  if (item.hasRisk || item.qcStatus === "risky") {
    alerts.push({
      label: "高风险任务",
      detail: "该任务被标记为风险样本，需要重点关注。",
      tone: "danger",
    });
  }

  if (item.mismatch.verify) {
    alerts.push({
      label: "核实状态不一致",
      detail: item.mismatch.verify,
      tone: "warning",
    });
  }

  if (item.mismatch.qc) {
    alerts.push({
      label: "质检状态不一致",
      detail: item.mismatch.qc,
      tone: "warning",
    });
  }

  for (const anomaly of item.anomalies) {
    if (!alerts.some((alert) => alert.detail === anomaly)) {
      alerts.push({
        label: "异常提示",
        detail: anomaly,
        tone: "warning",
      });
    }
  }

  return alerts;
}

export async function readFileUtf8(file: File): Promise<string> {
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

export function normalizeUploaded(files: FileList | File[] | null): UploadItem[] {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    id: `${file.name}_${file.lastModified}_${Math.random().toString(16).slice(2, 8)}`,
    file,
    role: inferRoleByName(file.name),
  }));
}

export function mergeUploads(existing: UploadItem[], incoming: UploadItem[]): UploadItem[] {
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
