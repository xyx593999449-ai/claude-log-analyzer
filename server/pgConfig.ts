import fs from "node:fs";
import path from "node:path";

export interface PgDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function loadFromYamlFile(): Partial<PgDbConfig> {
  const yamlPath = path.resolve(process.cwd(), "example", "db_conf", "db_config.yaml");
  if (!fs.existsSync(yamlPath)) return {};
  const raw = fs.readFileSync(yamlPath, "utf8");
  const parsed = parseSimpleYaml(raw);
  return {
    host: parsed.host,
    port: parsed.port ? Number(parsed.port) : undefined,
    database: parsed.database,
    user: parsed.user,
    password: parsed.password,
  };
}

export function loadPgConfig(): PgDbConfig {
  const yaml = loadFromYamlFile();

  const config: PgDbConfig = {
    host: process.env.PG_HOST ?? yaml.host ?? "",
    port: Number(process.env.PG_PORT ?? yaml.port ?? 5432),
    database: process.env.PG_DATABASE ?? yaml.database ?? "",
    user: process.env.PG_USER ?? yaml.user ?? "",
    password: process.env.PG_PASSWORD ?? yaml.password ?? "",
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => {
      if (key === "port") return !Number.isFinite(Number(value));
      return !value;
    })
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`PostgreSQL 配置缺失: ${missing.join(", ")}`);
  }

  return config;
}

