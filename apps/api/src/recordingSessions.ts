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
}

type Session = CodegenSession | HostedSession;

const sessions = new Map<string, Session>();

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

  // stdout/stderr를 로그 파일에 기록 (디버깅용)
  const { createWriteStream } = await import("node:fs");
  const logStream = createWriteStream(logPath, { flags: "a" });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);

  proc.on("error", () => {
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, { kind: "hosted", proc, sessionDir });
  return { sessionId };
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

  // proc 종료 대기: SIGTERM 후 최대 4초 기다려서 steps.json이 저장될 시간 확보
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

  const sessionDir = s.sessionDir;
  let steps: Step[] = [];
  try {
    const raw = await fs.readFile(path.join(sessionDir, "steps.json"), "utf8");
    steps = JSON.parse(raw) as Step[];
  } catch {
    steps = [];
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
