import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiSrcDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnv = path.resolve(apiSrcDir, "../../../.env");
const apiLocalEnv = path.resolve(apiSrcDir, "../.env");

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  return [key, value];
}

function shouldApplyFromFile(key: string): boolean {
  const current = process.env[key];
  return current === undefined || current.trim() === "";
}

export function loadEnvFile(): void {
  for (const file of [repoRootEnv, apiLocalEnv]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (shouldApplyFromFile(key)) process.env[key] = value;
    }
  }
}

loadEnvFile();
