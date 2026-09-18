export const FIGMA_TOKEN_SESSION_KEY = "testflow.figmaAccessToken";

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

export function maskFigmaToken(token: string): string {
  if (token.length <= 4) return "••••";
  return `••••${token.slice(-4)}`;
}

export function readSessionFigmaToken(): string | null {
  const value = sessionStorage.getItem(FIGMA_TOKEN_SESSION_KEY)?.trim();
  return value || null;
}

export function saveSessionFigmaToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Figma 토큰이 없습니다.");
  sessionStorage.setItem(FIGMA_TOKEN_SESSION_KEY, trimmed);
  return trimmed;
}

export function clearSessionFigmaToken(): void {
  sessionStorage.removeItem(FIGMA_TOKEN_SESSION_KEY);
}

export function getSessionTokenStatus(): TokenStatus {
  const token = readSessionFigmaToken();
  if (!token) return { configured: false, source: null, hint: null };
  return {
    configured: true,
    source: TOKEN_SOURCE.session,
    hint: maskFigmaToken(token),
  };
}

export function mergeTokenStatus(
  envStatus: TokenStatus,
  sessionStatus: TokenStatus,
): TokenStatus {
  if (envStatus.configured && envStatus.source === TOKEN_SOURCE.env)
    return envStatus;
  return sessionStatus;
}
