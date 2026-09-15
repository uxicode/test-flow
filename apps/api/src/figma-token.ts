import fs from "node:fs/promises";
import path from "node:path";
import { INGEST_ERROR, IngestError } from "@testflow/figma-ingest";
import { dataRoot } from "./data-root.js";

const TOKEN_ENV_KEYS = ["FIGMA_ACCESS_TOKEN", "FIGMA_TOKEN"] as const;

interface SettingsFile {
  figmaAccessToken?: string;
}

export const TOKEN_SOURCE = {
  env: "env",
  local: "local",
} as const;

export type TokenSource = (typeof TOKEN_SOURCE)[keyof typeof TOKEN_SOURCE];

export interface TokenStatus {
  configured: boolean;
  source: TokenSource | null;
  hint: string | null;
}

function settingsPath(): string {
  return path.join(dataRoot(), "settings.json");
}

function maskToken(token: string): string {
  if (token.length <= 4) return "••••";
  return `••••${token.slice(-4)}`;
}

async function readSettings(): Promise<SettingsFile> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return JSON.parse(raw) as SettingsFile;
  } catch {
    return {};
  }
}

function envToken(): string | undefined {
  for (const key of TOKEN_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function resolveFigmaToken(): Promise<{
  token: string;
  source: TokenSource;
}> {
  const fromEnv = envToken();
  if (fromEnv) return { token: fromEnv, source: TOKEN_SOURCE.env };
  const fromFile = (await readSettings()).figmaAccessToken?.trim();
  if (fromFile) return { token: fromFile, source: TOKEN_SOURCE.local };
  throw new IngestError(INGEST_ERROR.missingToken);
}

export async function getTokenStatus(): Promise<TokenStatus> {
  try {
    const resolved = await resolveFigmaToken();
    return {
      configured: true,
      source: resolved.source,
      hint: maskToken(resolved.token),
    };
  } catch {
    return { configured: false, source: null, hint: null };
  }
}

export async function saveLocalFigmaToken(token: string): Promise<TokenStatus> {
  const trimmed = token.trim();
  if (!trimmed) throw new IngestError(INGEST_ERROR.missingToken);
  await fs.mkdir(dataRoot(), { recursive: true });
  const current = await readSettings();
  await fs.writeFile(
    settingsPath(),
    `${JSON.stringify({ ...current, figmaAccessToken: trimmed }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return getTokenStatus();
}

export async function clearLocalFigmaToken(): Promise<TokenStatus> {
  const current = await readSettings();
  delete current.figmaAccessToken;
  await fs.mkdir(dataRoot(), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(current, null, 2)}\n`, {
    mode: 0o600,
  });
  return getTokenStatus();
}
