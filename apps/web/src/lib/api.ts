import type { TcFile, TcFileMeta, TcInput, TcTableAssert, TestCase } from "@testflow/tc";

export type { TcFile, TcFileMeta, TcInput, TcTableAssert, TestCase };

export interface AnalysisView {
  jobId: string;
  status: string;
  screens: Array<{ screenKey: string }>;
  cases: TestCase[];
}

export interface TcFileListView {
  files: TcFileMeta[];
}

export interface ExploreView {
  exploreId: string;
  url: string;
  status: "running" | "completed" | "failed" | "cancelled";
  mapId?: string;
  error?: string;
}

export type LocatorStrategy = "testid" | "role+name" | "label" | "nearby-text" | "placeholder" | "css";

/** CSS 모듈 해시 클래스 감지 (빌드마다 바뀌어 취약) */
export function isHashedCssModuleClient(selector: string): boolean {
  return /[._][a-z][a-zA-Z0-9]*_[a-z0-9]{3,}_[a-zA-Z0-9]{2,}/u.test(selector);
}

export { playwrightLocatorExpr as locatorCodeSnippet } from "@testflow/tc/playwright-spec";

export interface LocatorCandidate {
  strategy: LocatorStrategy;
  value: string;
}

export interface ElementEntry {
  label: string;
  controlKind: string;
  locators: LocatorCandidate[];
  dropdownOptionContainer: "inline" | "portal" | "listbox" | null;
  pinnedSelector?: string;
}

export interface ScreenElementMap {
  $version: number;
  url: string;
  normalizedUrl: string;
  exploredAt: string;
  screenTitle: string;
  elements: ElementEntry[];
  queryApiUrls: string[];
}

export interface ElementMapMeta {
  mapId: string;
  url: string;
  exploredAt: string;
  screenTitle: string;
  elementCount: number;
}

export interface ElementMapListView {
  maps: ElementMapMeta[];
}

export type MatchStatus = "matched" | "review" | "rejected" | "approved";
export type MatchMethod = "exact" | "rule" | "model" | "human";

export interface MatchCandidate {
  elementMapId: string;
  elementIndex: number;
  elementLabel: string;
  controlKind: string;
  bestLocator: LocatorCandidate;
  confidence: number;
  method: MatchMethod;
  reason: string;
}

export interface TcStepMatch {
  tcId: string;
  stepLabel: string;
  controlKind?: string;
  candidates: MatchCandidate[];
  chosenIndex: number;
  status: MatchStatus;
  reviewNote?: string;
}

export interface MatchSet {
  $version: number;
  jobId: string;
  mapId: string;
  createdAt: string;
  steps: TcStepMatch[];
}

export interface MatchSetMeta {
  matchId: string;
  jobId: string;
  mapId: string;
  createdAt: string;
  totalSteps: number;
  reviewCount: number;
  matchedCount: number;
}

export interface MatchListView {
  matches: MatchSetMeta[];
}

export interface MatchJobView {
  matchJobId: string;
  jobId: string;
  mapId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  matchId?: string;
  error?: string;
}

export interface LogEvent {
  channelId: string;
  message: string;
  at: string;
  caseId?: string;
  runStatus?: string;
  report?: string;
}

export interface RunView {
  runId: string;
  caseId: string;
  status: string;
  report: string;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "요청에 실패했습니다.");
  return payload;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "요청에 실패했습니다.");
  return payload;
}

export function openLogSocket(channelId: string, onEvent: (event: LogEvent) => void): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws/logs/${channelId}`);
  socket.onmessage = (message) => {
    onEvent(JSON.parse(String(message.data)) as LogEvent);
  };
  return socket;
}
