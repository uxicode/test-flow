import { INGEST_ERROR, IngestError } from "@testflow/figma-ingest";

const TOKEN_ENV_KEYS = ["FIGMA_ACCESS_TOKEN", "FIGMA_TOKEN"] as const;

export const TOKEN_SOURCE = {
  env: "env",
  session: "session",
} as const;

export type TokenSource = (typeof TOKEN_SOURCE)[keyof typeof TOKEN_SOURCE];

export interface TokenStatus {
  configured: boolean;
  source: TokenSource | null;
  hint: string | null;
}

function maskToken(token: string): string {
  if (token.length <= 4) return "••••";
  return `••••${token.slice(-4)}`;
}

function envToken(): string | undefined {
  for (const key of TOKEN_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveFigmaToken(requestToken?: string): {
  token: string;
  source: TokenSource;
} {
  const fromEnv = envToken();
  if (fromEnv) return { token: fromEnv, source: TOKEN_SOURCE.env };
  const fromSession = requestToken?.trim();
  if (fromSession) return { token: fromSession, source: TOKEN_SOURCE.session };
  throw new IngestError(INGEST_ERROR.missingToken);
}

export function getTokenStatus(): TokenStatus {
  const fromEnv = envToken();
  if (fromEnv) {
    return {
      configured: true,
      source: TOKEN_SOURCE.env,
      hint: maskToken(fromEnv),
    };
  }
  return { configured: false, source: null, hint: null };
}
