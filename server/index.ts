import "dotenv/config";
import express from "express";
import { AnalysisService } from "./analysisService";
import { createRepository } from "./repositoryFactory";
import type { DashboardFilters } from "./types";

const app = express();
app.use(express.json({ limit: "100mb" }));

const repository = createRepository();
const analysisService = new AnalysisService(repository);

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
