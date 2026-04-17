import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateSpec } from "./specGenerator.js";
import type { Step } from "./scenarioStore.js";

interface CodegenSession {
  kind: "codegen";
  proc: ChildProcess;
  outputPath: string;
}

interface HostedSession {
  kind: "hosted";
  proc: ChildProcess;
  sessionDir: string;
  steps: Step[];
  past: Step[][];
  future: Step[][];
  subscribers: Set<(payload: string) => void>;
}

type Session = CodegenSession | HostedSession;

const sessions = new Map<string, Session>();
const HISTORY_CAP = 50;

function cloneSteps(list: Step[]): Step[] {
  return list.map((s) => ({ ...s }));
}

function pushHistory(s: HostedSession): void {
  s.past.push(cloneSteps(s.steps));
  if (s.past.length > HISTORY_CAP) s.past.shift();
  s.future.length = 0;
}

function broadcast(s: HostedSession, msg: object): void {
  const payload = JSON.stringify(msg);
  for (const sub of s.subscribers) {
    try {
      sub(payload);
    } catch {
      /* ignore bad subscriber */
    }
  }
}

function broadcastSnapshot(s: HostedSession): void {
  broadcast(s, { type: "snapshot", steps: s.steps });
}

function getHosted(sessionId: string): HostedSession | null {
  const s = sessions.get(sessionId);
  if (!s || s.kind !== "hosted") return null;
  return s;
}

export async function startCodegenSession(
  playwrightRunnerRoot: string,
  recordingsDir: string,
  url: string,
): Promise<{ sessionId: string } | { error: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { error: "url_required" };

  await fs.mkdir(recordingsDir, { recursive: true });
  const sessionId = randomUUID();
  const outputPath = path.join(recordingsDir, `${sessionId}.spec.ts`);

  const proc = spawn(
    "npx",
    ["playwright", "codegen", trimmed, "--output", outputPath],
    {
      cwd: playwrightRunnerRoot,
      stdio: "ignore",
      env: { ...process.env },
      shell: process.platform === "win32",
    },
  );

  proc.on("error", () => {
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, { kind: "codegen", proc, outputPath });
  return { sessionId };
}

export async function startHostedRecordSession(
  playwrightRunnerRoot: string,
  recordingsDir: string,
  url: string,
  options?: { scenarioId?: string },
): Promise<{ sessionId: string } | { error: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { error: "url_required" };

  await fs.mkdir(recordingsDir, { recursive: true });
  const sessionId = randomUUID();
  const sessionDir = path.join(recordingsDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const startedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(sessionDir, "recording.json"),
    JSON.stringify(
      {
        scenarioId: options?.scenarioId ?? null,
        startedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  const recordHost = path.join(playwrightRunnerRoot, "src", "recordHost.ts");
  const logPath = path.join(sessionDir, "recordHost.log");

  const proc = spawn("npx", ["tsx", recordHost, sessionDir, trimmed], {
    cwd: playwrightRunnerRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: process.platform === "win32",
  });

  const { createWriteStream } = await import("node:fs");
  const logStream = createWriteStream(logPath, { flags: "a" });
  proc.stderr?.pipe(logStream);

  const session: HostedSession = {
    kind: "hosted",
    proc,
    sessionDir,
    steps: [],
    past: [],
    future: [],
    subscribers: new Set(),
  };

  /* stdout을 라인 버퍼링하여 TFSTEP_ADD / TFSTEP_UPDATE를 파싱.
     그 외 라인은 디버그 로그 파일에 그대로 기록. */
  let stdoutBuffer = "";
  proc.stdout?.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stdoutBuffer += text;
    let newlineIdx;
    while ((newlineIdx = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, newlineIdx);
      stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
      handleStdoutLine(session, line, logStream);
    }
  });
  proc.stdout?.on("end", () => {
    if (stdoutBuffer.length > 0) {
      handleStdoutLine(session, stdoutBuffer, logStream);
      stdoutBuffer = "";
    }
  });

  proc.on("error", () => {
    sessions.delete(sessionId);
    broadcast(session, { type: "closed", reason: "process_error" });
  });

  sessions.set(sessionId, session);
  return { sessionId };
}

function handleStdoutLine(
  session: HostedSession,
  line: string,
  logStream: NodeJS.WritableStream,
): void {
  try {
    logStream.write(line + "\n");
  } catch {
    /* ignore */
  }
  if (line.startsWith("TFSTEP_ADD ")) {
    try {
      const step = JSON.parse(line.slice("TFSTEP_ADD ".length)) as Step;
      session.steps.push(step);
      broadcast(session, { type: "step:added", step });
    } catch {
      /* malformed — skip */
    }
  } else if (line.startsWith("TFSTEP_UPDATE ")) {
    try {
      const step = JSON.parse(line.slice("TFSTEP_UPDATE ".length)) as Step;
      const idx = session.steps.findIndex((s) => s.id === step.id);
      if (idx >= 0) session.steps[idx] = step;
      else session.steps.push(step);
      broadcastSnapshot(session);
    } catch {
      /* skip */
    }
  }
}

export function getHostedSteps(sessionId: string): Step[] | null {
  const s = getHosted(sessionId);
  if (!s) return null;
  return cloneSteps(s.steps);
}

export function subscribeHosted(
  sessionId: string,
  fn: (payload: string) => void,
): () => void {
  const s = getHosted(sessionId);
  if (!s) return () => {};
  s.subscribers.add(fn);
  return () => {
    s.subscribers.delete(fn);
  };
}

export function patchHostedStep(
  sessionId: string,
  stepId: string,
  patch: Partial<Step>,
): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  const idx = s.steps.findIndex((x) => x.id === stepId);
  if (idx < 0) {
    broadcastSnapshot(s);
    return false;
  }
  pushHistory(s);
  const prev = s.steps[idx];
  s.steps[idx] = { ...prev, ...patch, id: prev.id };
  broadcastSnapshot(s);
  return true;
}

export function deleteHostedStep(sessionId: string, stepId: string): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  const idx = s.steps.findIndex((x) => x.id === stepId);
  if (idx < 0) {
    broadcastSnapshot(s);
    return false;
  }
  pushHistory(s);
  s.steps.splice(idx, 1);
  broadcastSnapshot(s);
  return true;
}

export function addHostedStep(
  sessionId: string,
  partial: Partial<Step> & { type: Step["type"] },
  atIndex?: number,
): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  pushHistory(s);
  const step: Step = {
    id: randomUUID().slice(0, 8),
    type: partial.type,
    selectorStrategy: partial.selectorStrategy ?? "css",
    selectorValue: partial.selectorValue ?? "",
    role: partial.role ?? "button",
    inputValue: partial.inputValue ?? "",
    waitMs: partial.waitMs ?? 1000,
    label: partial.label ?? "",
  };
  const safeIdx =
    typeof atIndex === "number" && atIndex >= 0 && atIndex <= s.steps.length
      ? atIndex
      : s.steps.length;
  s.steps.splice(safeIdx, 0, step);
  broadcastSnapshot(s);
  return true;
}

export function reorderHostedSteps(sessionId: string, ids: string[]): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  const byId = new Map(s.steps.map((st) => [st.id, st]));
  /* 입력 순서를 우선 적용하고, 빠진 id는 원래 순서대로 뒤에 붙여 유실을 방지 */
  const next: Step[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const st = byId.get(id);
    if (st && !used.has(id)) {
      next.push(st);
      used.add(id);
    }
  }
  for (const st of s.steps) {
    if (!used.has(st.id)) next.push(st);
  }
  if (JSON.stringify(next.map((x) => x.id)) === JSON.stringify(s.steps.map((x) => x.id))) {
    return false;
  }
  pushHistory(s);
  s.steps = next;
  broadcastSnapshot(s);
  return true;
}

export function undoHosted(sessionId: string): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  const prev = s.past.pop();
  if (!prev) return false;
  s.future.push(cloneSteps(s.steps));
  if (s.future.length > HISTORY_CAP) s.future.shift();
  s.steps = prev;
  broadcastSnapshot(s);
  return true;
}

export function redoHosted(sessionId: string): boolean {
  const s = getHosted(sessionId);
  if (!s) return false;
  const next = s.future.pop();
  if (!next) return false;
  s.past.push(cloneSteps(s.steps));
  if (s.past.length > HISTORY_CAP) s.past.shift();
  s.steps = next;
  broadcastSnapshot(s);
  return true;
}

export async function stopCodegenSession(
  sessionId: string,
  recordingsDir: string,
): Promise<{ script: string } | { error: string }> {
  const outputPath = path.join(recordingsDir, `${sessionId}.spec.ts`);
  const s = sessions.get(sessionId);
  if (s?.kind === "hosted") return { error: "wrong_session_kind" };
  if (s?.kind === "codegen") {
    sessions.delete(sessionId);
    try {
      s.proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }

  await new Promise((r) => setTimeout(r, 500));

  try {
    const script = await fs.readFile(outputPath, "utf8");
    await fs.unlink(outputPath).catch(() => {});
    if (!script.trim()) return { error: "empty_output" };
    return { script };
  } catch {
    if (s?.kind === "codegen") return { error: "read_failed" };
    return { error: "session_not_found" };
  }
}

export interface HostedStopResult {
  script: string;
  steps: Step[];
  parseWarnings: string[];
  sessionKind: "hosted";
  sessionArtifacts: {
    videoUrl: string;
  };
}

export async function stopHostedRecordSession(
  sessionId: string,
  recordingsDir: string,
): Promise<HostedStopResult | { error: string }> {
  const s = sessions.get(sessionId);
  if (!s || s.kind !== "hosted") return { error: "session_not_found" };

  sessions.delete(sessionId);

  /* 실시간 스튜디오 구독자에 종료 알림 후, 프로세스 종료 대기 */
  broadcast(s, { type: "closed", reason: "stopped" });

  const exitPromise = new Promise<void>((resolve) => {
    s.proc.once("exit", () => resolve());
    s.proc.once("error", () => resolve());
  });
  try {
    s.proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  await Promise.race([exitPromise, new Promise<void>((r) => setTimeout(r, 4000))]);

  /* in-memory 스텝을 권위적으로 steps.json에 기록 — 사용자 편집본이 그대로 저장됨 */
  const sessionDir = s.sessionDir;
  const steps = cloneSteps(s.steps);
  try {
    await fs.writeFile(
      path.join(sessionDir, "steps.json"),
      JSON.stringify(steps, null, 2),
      "utf8",
    );
  } catch {
    /* 디스크 저장 실패는 치명적이지 않음 — 응답에는 그대로 포함 */
  }

  const script = steps.length > 0 ? generateSpec(steps) : "";

  const videoDir = path.join(sessionDir, "video");
  let videoRel = "";
  try {
    const names = await fs.readdir(videoDir);
    const webm = names.find((n) => n.toLowerCase().endsWith(".webm"));
    if (webm) videoRel = `video/${webm}`;
  } catch {
    /* no video */
  }

  const base = `/api/recordings/${sessionId}`;
  const warnings: string[] = [];
  if (!videoRel) warnings.push("session_video_missing");
  if (steps.length === 0) warnings.push("no_steps_captured");

  return {
    script,
    steps,
    parseWarnings: warnings,
    sessionKind: "hosted",
    sessionArtifacts: {
      videoUrl: videoRel ? `${base}/${videoRel}` : "",
    },
  };
}
