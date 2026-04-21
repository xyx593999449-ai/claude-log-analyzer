import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import type {
  HitlBatchImportErrorDetail,
  HitlBatchImportNormalizedRow,
  HitlBatchImportPreviewResponse,
  HitlBatchImportPreviewRow,
} from "../types";

export const HITL_IMPORT_TARGET_TABLE = "public.t_poi_key_property_check_result_ext";
export const HITL_IMPORT_PREVIEW_LIMIT = 20;
export const HITL_IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000;
export const HITL_IMPORT_BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

type ColumnKind = "text" | "int" | "float" | "jsonb" | "timestamp";

interface ColumnDefinition {
  name: string;
  kind: ColumnKind;
}

interface ParsedCsvRow {
  rowNumber: number;
  cells: string[];
}

export interface HitlBatchImportPreviewCacheItem {
  batchId: string;
  fileName: string;
  columns: string[];
  rows: HitlBatchImportNormalizedRow[];
  previewRows: HitlBatchImportPreviewRow[];
  createdAt: string;
  expiresAt: number;
}

export class HitlImportHttpError extends Error {
  status: number;
  details?: HitlBatchImportErrorDetail[];

  constructor(status: number, message: string, details?: HitlBatchImportErrorDetail[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const HITL_IMPORT_COLUMNS: ColumnDefinition[] = [
  { name: "id", kind: "text" },
  { name: "guid", kind: "text" },
  { name: "pid", kind: "int" },
  { name: "name_chn", kind: "text" },
  { name: "poi_type", kind: "text" },
  { name: "addr_chn", kind: "text" },
  { name: "x_coord", kind: "float" },
  { name: "y_coord", kind: "float" },
  { name: "poi_id", kind: "text" },
  { name: "adcode", kind: "text" },
  { name: "data_src", kind: "text" },
  { name: "aoi_guid", kind: "text" },
  { name: "building_guid", kind: "text" },
  { name: "exttype", kind: "text" },
  { name: "alive", kind: "text" },
  { name: "alias", kind: "text" },
  { name: "short_name", kind: "text" },
  { name: "pc_type", kind: "text" },
  { name: "status", kind: "text" },
  { name: "version", kind: "int" },
  { name: "task_check_id", kind: "text" },
  { name: "picture_path", kind: "text" },
  { name: "remark", kind: "text" },
  { name: "main_task_id", kind: "text" },
  { name: "create_time", kind: "timestamp" },
  { name: "create_by", kind: "text" },
  { name: "ng_attribute", kind: "text" },
  { name: "package_id", kind: "int" },
  { name: "save_count", kind: "int" },
  { name: "judge_result", kind: "text" },
  { name: "worker_remark_id", kind: "text" },
  { name: "extra_info", kind: "text" },
  { name: "task_id", kind: "text" },
  { name: "verify_result", kind: "text" },
  { name: "evidence_record", kind: "jsonb" },
  { name: "qc_status", kind: "text" },
  { name: "qc_result", kind: "jsonb" },
  { name: "old_name", kind: "text" },
  { name: "old_x_coord", kind: "float" },
  { name: "old_y_coord", kind: "float" },
  { name: "old_poi_type", kind: "text" },
  { name: "old_address", kind: "text" },
  { name: "city", kind: "text" },
  { name: "old_city", kind: "text" },
  { name: "old_city_adcode", kind: "text" },
  { name: "verify_content_is_correct", kind: "text" },
  { name: "verify_action_is_correct", kind: "text" },
  { name: "qc_intercept_is_correct", kind: "text" },
  { name: "evidence_status", kind: "text" },
  { name: "issue_observation_tags", kind: "text" },
  { name: "judgment_dimension_tags", kind: "text" },
  { name: "manual_comment", kind: "text" },
  { name: "conflicting_evidence", kind: "text" },
  { name: "manual_added_evidence_url", kind: "text" },
  { name: "manual_added_evidence_type", kind: "text" },
  { name: "manual_added_evidence_abstract", kind: "text" },
  { name: "write_status", kind: "text" },
  { name: "poi_status", kind: "text" },
  { name: "old_poi_status", kind: "text" },
  { name: "verified_name", kind: "text" },
  { name: "verified_x_coord", kind: "float" },
  { name: "verified_y_coord", kind: "float" },
  { name: "verified_poi_type", kind: "text" },
  { name: "verified_address", kind: "text" },
  { name: "verified_city", kind: "text" },
  { name: "verified_city_adcode", kind: "text" },
  { name: "verified_poi_status", kind: "text" },
  { name: "batch_id", kind: "text" },
];

const COLUMN_BY_NAME = new Map(HITL_IMPORT_COLUMNS.map((column) => [column.name, column]));
const CSV_ALLOWED_COLUMNS = new Set(HITL_IMPORT_COLUMNS.map((column) => column.name).filter((name) => name !== "batch_id"));
const REQUIRED_COLUMNS = ["id", "task_id", "manual_comment"];
const CORE_JUDGMENT_COLUMNS = [
  "verify_content_is_correct",
  "verify_action_is_correct",
  "qc_intercept_is_correct",
  "evidence_status",
  "issue_observation_tags",
  "judgment_dimension_tags",
] as const;
const ISSUE_OBSERVATION_ALLOWED = new Set([
  "evidence_missing",
  "evidence_invalid",
  "evidence_conflicting",
  "invalid_evidence_cited",
]);
const JUDGMENT_DIMENSION_ALLOWED = new Set([
  "name_judgment_problem",
  "address_judgment_problem",
  "type_judgment_problem",
  "location_judgment_problem",
  "admin_judgment_problem",
  "evidence_usage_problem",
  "manual_escalation_strategy_problem",
  "qc_intercept_rule_problem",
]);
const PREVIEW_COLUMNS = [
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

function normalizeNullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase() === "null" || text.toLowerCase() === "nan") return null;
  return text;
}

function parseCsvRows(text: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const pushRow = () => {
    const nextRow = [...row, cell];
    const isTrailingEmpty = nextRow.length === 1 && nextRow[0] === "" && rows.length > 0;
    if (!isTrailingEmpty) {
      rows.push({ rowNumber: rowStartLine, cells: nextRow });
    }
    row = [];
    cell = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
        if (char === "\n") line += 1;
      }
      continue;
    }

    if (char === "\"") {
      if (cell.length > 0) {
        throw new HitlImportHttpError(400, "CSV 格式不合法", [
          { rowNumber: rowStartLine, message: "发现未转义的引号字符" },
        ]);
      }
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\r") continue;

    if (char === "\n") {
      pushRow();
      line += 1;
      rowStartLine = line;
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new HitlImportHttpError(400, "CSV 格式不合法", [{ rowNumber: rowStartLine, message: "存在未闭合的引号" }]);
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

function decodeUtf8WithoutBom(buffer: Buffer): string {
  if (!buffer.length) {
    throw new HitlImportHttpError(400, "上传文件不能为空");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    throw new HitlImportHttpError(400, "CSV 编码必须为 UTF-8 无 BOM");
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(buffer);
  } catch {
    throw new HitlImportHttpError(400, "CSV 编码必须为 UTF-8 无 BOM");
  }
}

function parseJsonField(value: string | null, field: string, rowNumber: number): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber, field, message: "JSON 字段不是合法 JSON" }]);
  }
}

function parseIntField(value: string | null, field: string, rowNumber: number): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber, field, message: "字段必须是整数" }]);
  }
  return num;
}

function parseFloatField(value: string | null, field: string, rowNumber: number): number | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber, field, message: "字段必须是数字" }]);
  }
  return num;
}

function normalizeTags(rawValue: string | null, allowedTags: Set<string>, field: string, rowNumber: number): string | null {
  if (!rawValue) return null;
  const values = rawValue
    .split(/[,\n\r;，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item === "admin_judgement_problem" ? "admin_judgment_problem" : item));
  if (values.length === 0) return null;
  for (const value of values) {
    if (!allowedTags.has(value)) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber, field, message: `包含未知标签: ${value}` }]);
    }
  }
  return values.join(",");
}

function validateBinaryFlag(rawValue: string | null, field: string, rowNumber: number): string | null {
  if (!rawValue) return null;
  if (rawValue !== "0" && rawValue !== "1") {
    throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber, field, message: "仅允许 0、1 或空值" }]);
  }
  return rawValue;
}

function validateEvidenceStatus(rawValue: string | null, rowNumber: number): string | null {
  if (!rawValue) return null;
  if (!["0", "1", "2"].includes(rawValue)) {
    throw new HitlImportHttpError(400, "CSV 校验失败", [
      { rowNumber, field: "evidence_status", message: "仅允许 0、1、2 或空值" },
    ]);
  }
  return rawValue;
}

function validateQcStatus(rawValue: string | null, rowNumber: number): string | null {
  if (!rawValue) return null;
  const normalized = rawValue.toLowerCase();
  if (!["qualified", "risky", "unqualified"].includes(normalized)) {
    throw new HitlImportHttpError(400, "CSV 校验失败", [
      { rowNumber, field: "qc_status", message: "仅允许 qualified、risky、unqualified 或空值" },
    ]);
  }
  return normalized;
}

function buildPreviewRows(rows: HitlBatchImportNormalizedRow[]): HitlBatchImportPreviewRow[] {
  return rows.slice(0, HITL_IMPORT_PREVIEW_LIMIT).map((row) => {
    const values: Record<string, string | null> = {};
    for (const column of PREVIEW_COLUMNS) {
      const value = row.values[column];
      if (value == null) {
        values[column] = null;
      } else if (typeof value === "string") {
        values[column] = value;
      } else {
        values[column] = JSON.stringify(value);
      }
    }
    return {
      rowNumber: row.rowNumber,
      values,
    };
  });
}

export function validateBatchIdOrThrow(batchId: string): string {
  const normalized = batchId.trim();
  if (!normalized) {
    throw new HitlImportHttpError(400, "batch_id 为必填项");
  }
  if (!HITL_IMPORT_BATCH_ID_PATTERN.test(normalized)) {
    throw new HitlImportHttpError(400, "batch_id 仅允许 3-64 位字母、数字、下划线或短横线");
  }
  return normalized;
}

export function buildHitlImportPreview(params: {
  batchId: string;
  fileName: string;
  fileBuffer: Buffer;
}): HitlBatchImportPreviewCacheItem {
  const batchId = validateBatchIdOrThrow(params.batchId);
  const fileName = params.fileName.trim();
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new HitlImportHttpError(400, "仅支持上传 CSV 文件");
  }

  const content = decodeUtf8WithoutBom(params.fileBuffer);
  const parsedRows = parseCsvRows(content);
  if (parsedRows.length === 0) {
    throw new HitlImportHttpError(400, "CSV 文件不能为空");
  }

  const [headerRow, ...dataRows] = parsedRows;
  const columns = headerRow.cells.map((cell) => normalizeNullableText(cell) ?? "");
  if (columns.some((column) => !column)) {
    throw new HitlImportHttpError(400, "CSV 表头不能为空", [{ rowNumber: headerRow.rowNumber, message: "存在空表头列名" }]);
  }

  const duplicateColumns = columns.filter((column, index) => columns.indexOf(column) !== index);
  if (duplicateColumns.length > 0) {
    throw new HitlImportHttpError(400, "CSV 表头不合法", [
      { rowNumber: headerRow.rowNumber, message: `存在重复表头: ${Array.from(new Set(duplicateColumns)).join(", ")}` },
    ]);
  }

  for (const column of columns) {
    if (column === "batch_id") continue;
    if (!CSV_ALLOWED_COLUMNS.has(column)) {
      throw new HitlImportHttpError(400, "CSV 表头不合法", [
        { rowNumber: headerRow.rowNumber, field: column, message: "字段不在目标表 DDL 白名单内" },
      ]);
    }
  }

  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) {
      throw new HitlImportHttpError(400, "CSV 缺少必填列", [{ field: column, message: "缺少必填列" }]);
    }
  }

  if (!CORE_JUDGMENT_COLUMNS.some((column) => columns.includes(column))) {
    throw new HitlImportHttpError(400, "CSV 缺少人工判定列", [
      { message: `至少需要包含以下字段之一: ${CORE_JUDGMENT_COLUMNS.join(", ")}` },
    ]);
  }

  if (dataRows.length === 0) {
    throw new HitlImportHttpError(400, "CSV 文件不能为空");
  }

  const normalizedRows: HitlBatchImportNormalizedRow[] = [];
  const seenIds = new Set<string>();
  const seenTaskIds = new Set<string>();

  for (const rawRow of dataRows) {
    if (rawRow.cells.every((cell) => !normalizeNullableText(cell))) continue;
    if (rawRow.cells.length !== columns.length) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [
        {
          rowNumber: rawRow.rowNumber,
          message: `列数与表头不一致，期望 ${columns.length} 列，实际 ${rawRow.cells.length} 列`,
        },
      ]);
    }

    const sourceRow: Record<string, string | null> = {};
    columns.forEach((column, index) => {
      sourceRow[column] = normalizeNullableText(rawRow.cells[index]);
    });

    const id = normalizeNullableText(sourceRow.id);
    if (!id) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber: rawRow.rowNumber, field: "id", message: "字段不能为空" }]);
    }
    if (seenIds.has(id)) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [{ rowNumber: rawRow.rowNumber, field: "id", message: `文件内重复 id: ${id}` }]);
    }
    seenIds.add(id);

    const taskId = normalizeNullableText(sourceRow.task_id);
    if (!taskId) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [
        { rowNumber: rawRow.rowNumber, field: "task_id", message: "字段不能为空" },
      ]);
    }
    if (seenTaskIds.has(taskId)) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [
        { rowNumber: rawRow.rowNumber, field: "task_id", message: `文件内重复 task_id: ${taskId}` },
      ]);
    }
    seenTaskIds.add(taskId);

    const manualComment = normalizeNullableText(sourceRow.manual_comment);
    if (!manualComment) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [
        { rowNumber: rawRow.rowNumber, field: "manual_comment", message: "字段不能为空" },
      ]);
    }

    const hasAnyJudgmentValue = CORE_JUDGMENT_COLUMNS.some((column) => Boolean(normalizeNullableText(sourceRow[column])));
    if (!hasAnyJudgmentValue) {
      throw new HitlImportHttpError(400, "CSV 校验失败", [
        { rowNumber: rawRow.rowNumber, message: "至少需要填写一个人工判定字段" },
      ]);
    }

    const values: Record<string, unknown> = {};
    for (const column of HITL_IMPORT_COLUMNS) {
      if (column.name === "batch_id") {
        values.batch_id = batchId;
        continue;
      }

      const rawValue = column.name === "batch_id" ? null : sourceRow[column.name];
      switch (column.name) {
        case "verify_content_is_correct":
        case "verify_action_is_correct":
        case "qc_intercept_is_correct":
          values[column.name] = validateBinaryFlag(rawValue, column.name, rawRow.rowNumber);
          break;
        case "evidence_status":
          values[column.name] = validateEvidenceStatus(rawValue, rawRow.rowNumber);
          break;
        case "issue_observation_tags":
          values[column.name] = normalizeTags(rawValue, ISSUE_OBSERVATION_ALLOWED, column.name, rawRow.rowNumber);
          break;
        case "judgment_dimension_tags":
          values[column.name] = normalizeTags(rawValue, JUDGMENT_DIMENSION_ALLOWED, column.name, rawRow.rowNumber);
          break;
        case "qc_status":
          values[column.name] = validateQcStatus(rawValue, rawRow.rowNumber);
          break;
        default:
          if (column.kind === "int") {
            values[column.name] = parseIntField(rawValue, column.name, rawRow.rowNumber);
          } else if (column.kind === "float") {
            values[column.name] = parseFloatField(rawValue, column.name, rawRow.rowNumber);
          } else if (column.kind === "jsonb") {
            values[column.name] = parseJsonField(rawValue, column.name, rawRow.rowNumber);
          } else {
            values[column.name] = rawValue;
          }
          break;
      }
    }

    values.id = id;
    values.task_id = taskId;
    values.manual_comment = manualComment;
    normalizedRows.push({
      rowNumber: rawRow.rowNumber,
      values,
    });
  }

  if (normalizedRows.length === 0) {
    throw new HitlImportHttpError(400, "CSV 文件不能为空");
  }

  const previewRows = buildPreviewRows(normalizedRows);
  return {
    batchId,
    fileName,
    columns,
    rows: normalizedRows,
    previewRows,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + HITL_IMPORT_PREVIEW_TTL_MS,
  };
}

export function toHitlImportPreviewResponse(item: HitlBatchImportPreviewCacheItem): HitlBatchImportPreviewResponse {
  return {
    batchId: item.batchId,
    fileName: item.fileName,
    totalRows: item.rows.length,
    validRows: item.rows.length,
    previewToken: randomUUID(),
    columns: item.columns,
    previewRows: item.previewRows,
  };
}

export function getHitlImportColumns(): ColumnDefinition[] {
  return HITL_IMPORT_COLUMNS.map((column) => ({ ...column }));
}

export function getHitlImportColumnNames(): string[] {
  return HITL_IMPORT_COLUMNS.map((column) => column.name);
}

export function getHitlImportColumnDefinition(name: string): ColumnDefinition | undefined {
  return COLUMN_BY_NAME.get(name);
}
