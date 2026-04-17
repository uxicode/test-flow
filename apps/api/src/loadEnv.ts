import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = stripQuotes(line.slice(idx + 1));
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function candidateEnvPaths(): string[] {
  const cwd = process.cwd();
  return [
    ...(process.env.TESTFLOW_ENV_FILE ? [process.env.TESTFLOW_ENV_FILE] : []),
    path.join(cwd, ".env"),
    path.join(cwd, "apps", "api", ".env"),
    path.join(__dirname, "..", ".env"),
  ];
}

function loadEnv(): void {
  for (const envPath of candidateEnvPaths()) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, "utf8");
      const parsed = parseEnvFile(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    } catch {
      // Ignore malformed or unreadable env files and keep searching.
    }
  }
}

loadEnv();
