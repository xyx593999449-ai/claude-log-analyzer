import "dotenv/config";
import express from "express";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { AnalysisService } from "./analysisService";
import { createRepository } from "./repositoryFactory";
import type { AnalysisPhase } from "./types";
import type { DashboardFilters } from "./types";

const app = express();
app.use(express.json({ limit: "100mb" }));

const repository = createRepository();
const analysisService = new AnalysisService(repository);
const uploadDir = path.resolve(process.cwd(), "tmp", "uploads");
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      const safeName = file.originalname.replace(/[^\w.-]+/g, "_");
      cb(null, `${suffix}_${safeName}`);
    },
  }),
  limits: {
    files: Math.max(1, Number(process.env.UPLOAD_MAX_FILES ?? 200)),
    fileSize: Math.max(1, Number(process.env.UPLOAD_MAX_FILE_MB ?? 1024)) * 1024 * 1024,
  },
});

type UploadRole = "executor" | "claude" | "unknown";

function parseUploadField(fieldname: string): { phase: AnalysisPhase; role: UploadRole } | null {
  const matched = fieldname.match(/^(verify|qc)_(executor|claude|unknown)$/);
  if (!matched) return null;
  return {
    phase: matched[1] as AnalysisPhase,
    role: matched[2] as UploadRole,
  };
}

function parseBoolean(value: unknown): boolean {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  return false;
}

function parseFilters(query: Record<string, unknown>): DashboardFilters {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(query.pageSize ?? 20) || 20));

  return {
    page,
    pageSize,
    search: String(query.search ?? "").trim(),
    verifyStatus: String(query.verifyStatus ?? "").trim(),
    qcStatus: String(query.qcStatus ?? "").trim(),
    manualOnly: parseBoolean(query.manualOnly),
    anomalyOnly: parseBoolean(query.anomalyOnly),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dbClient: String(process.env.DB_CLIENT ?? "sqlite").toLowerCase(),
    ts: new Date().toISOString(),
  });
});

app.get("/api/dashboard/overview", async (_req, res, next) => {
  try {
    res.json(await repository.getOverview());
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard/filter-options", async (_req, res, next) => {
  try {
    res.json(await repository.getFilterOptions());
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard/tasks", async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, unknown>);
    res.json(await repository.getTaskList(filters));
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard/tasks/:taskId/logs", async (req, res, next) => {
  try {
    res.json(await repository.getTaskLogDetail(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/dashboard/import", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const payload = {
      source: String(body.source ?? "manual_upload"),
      verifyExecutorLog: typeof body.verifyExecutorLog === "string" ? body.verifyExecutorLog : undefined,
      verifyClaudeLog: typeof body.verifyClaudeLog === "string" ? body.verifyClaudeLog : undefined,
      qcExecutorLog: typeof body.qcExecutorLog === "string" ? body.qcExecutorLog : undefined,
      qcClaudeLog: typeof body.qcClaudeLog === "string" ? body.qcClaudeLog : undefined,
    };

    const result = await analysisService.importLogs(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/dashboard/import-files", upload.any(), async (req, res, next) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    if (files.length === 0) {
      throw new Error("请先上传核实或质检日志文件");
    }

    const importFiles = files.map((file) => {
      const parsed = parseUploadField(file.fieldname);
      if (!parsed) {
        throw new Error(`不支持的文件字段: ${file.fieldname}`);
      }
      return {
        phase: parsed.phase,
        role: parsed.role,
        originalName: file.originalname,
        filePath: file.path,
      };
    });

    const source = typeof req.body.source === "string" ? req.body.source : "manual_upload";
    const result = await analysisService.importLogFiles({
      source,
      files: importFiles,
    });

    res.json(result);
  } catch (error) {
    next(error);
  } finally {
    await Promise.all(files.map((file) => fs.rm(file.path, { force: true }).catch(() => undefined)));
  }
});

app.post("/api/dashboard/clear-cache", async (_req, res, next) => {
  try {
    res.json(await repository.clearAnalysisCache());
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Dashboard API listening on http://localhost:${port}`);
});
