import { DashboardRepository, type DashboardRepositoryPort } from "./repository";
import { loadPgConfig } from "./pgConfig";
import { PgDashboardRepository } from "./repository.pg";

export function createRepository(): DashboardRepositoryPort {
  const client = String(process.env.DB_CLIENT ?? "sqlite").toLowerCase();
  if (client === "pg" || client === "postgres" || client === "postgresql") {
    const config = loadPgConfig();
    return new PgDashboardRepository(config);
  }
  return new DashboardRepository();
}

