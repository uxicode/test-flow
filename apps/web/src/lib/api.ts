import type { TcInput, TestCase } from "@testflow/tc";

export type { TcInput, TestCase };

export interface AnalysisView {
  jobId: string;
  status: string;
  screens: Array<{ screenKey: string }>;
  cases: TestCase[];
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
