import type {
  DashboardOverview,
  FilterOptions,
  ImportResult,
  TaskListResult,
  TaskLogDetail,
} from "./dashboardTypes";

interface TaskQuery {
  page: number;
  pageSize: number;
  search: string;
  verifyStatus: string;
  qcStatus: string;
  alertTags: string[];
  manualOnly: boolean;
  anomalyOnly: boolean;
}

interface ImportPayload {
  source: string;
  verifyExecutorLog?: string;
  verifyClaudeLog?: string;
  qcExecutorLog?: string;
  qcClaudeLog?: string;
}

export type UploadRole = "executor" | "claude" | "unknown";
export type UploadPhase = "verify" | "qc";

export interface UploadLogFile {
  phase: UploadPhase;
  role: UploadRole;
  file: File;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const requestInit: RequestInit = {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    ...init,
  };

  let res: Response;
  try {
    res = await fetch(path, requestInit);
  } catch {
    // Fallback when Vite proxy is unavailable.
    res = await fetch(`http://127.0.0.1:3001${path}`, requestInit);
  }

  if (!res.ok) {
    let message = `请求失败: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function fetchOverview(): Promise<DashboardOverview> {
  return request<DashboardOverview>("/api/dashboard/overview");
}

export function fetchFilterOptions(): Promise<FilterOptions> {
  return request<FilterOptions>("/api/dashboard/filter-options");
}

export function fetchTaskList(query: TaskQuery): Promise<TaskListResult> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    search: query.search,
    verifyStatus: query.verifyStatus,
    qcStatus: query.qcStatus,
    alertTags: query.alertTags.join(","),
    manualOnly: String(query.manualOnly),
    anomalyOnly: String(query.anomalyOnly),
  });
  return request<TaskListResult>(`/api/dashboard/tasks?${params.toString()}`);
}

export function fetchTaskLogs(taskId: string): Promise<TaskLogDetail> {
  return request<TaskLogDetail>(`/api/dashboard/tasks/${taskId}/logs`);
}

export function importLogs(payload: ImportPayload): Promise<ImportResult> {
  return request<ImportResult>("/api/dashboard/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importLogsByFiles(payload: { source: string; files: UploadLogFile[] }): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("source", payload.source);
  for (const item of payload.files) {
    formData.append(`${item.phase}_${item.role}`, item.file, item.file.name);
  }

  return request<ImportResult>("/api/dashboard/import-files", {
    method: "POST",
    body: formData,
  });
}

export function clearCache(): Promise<{ deletedRows: number; deletedImports: number }> {
  return request<{ deletedRows: number; deletedImports: number }>("/api/dashboard/clear-cache", {
    method: "POST",
  });
}
