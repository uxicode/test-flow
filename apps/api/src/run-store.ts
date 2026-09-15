import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { RunnerEvent } from "@testflow/runner-contract";
import { rotateRuns } from "@testflow/playwright-runner";
import { DATA_DIR_NAMES, RUN_LIMITS, resolveDataDir } from "@testflow/shared";
import { dataRoot } from "./data-root.js";

export const RUN_STATUS = {
  queued: "queued",
  running: "running",
  passed: "passed",
  failed: "failed",
  error: "error",
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export interface RunRecord {
  runId: string;
  documentId: string;
  caseId: string;
  startUrl: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  failStepId?: string;
  videoPath?: string;
  stepTimeoutMs: number;
}

function runsRoot(): string {
  return resolveDataDir(dataRoot(), DATA_DIR_NAMES.runs);
}

export function runDir(runId: string): string {
  return path.join(runsRoot(), runId);
}

function metaPath(runId: string): string {
  return path.join(runDir(runId), "run.json");
}

function eventsPath(runId: string): string {
  return path.join(runDir(runId), "events.jsonl");
}

export async function createRun(input: {
  documentId: string;
  caseId: string;
  startUrl: string;
}): Promise<RunRecord> {
  const record: RunRecord = {
    runId: randomUUID(),
    documentId: input.documentId,
    caseId: input.caseId,
    startUrl: input.startUrl,
    status: RUN_STATUS.queued,
    startedAt: new Date().toISOString(),
    stepTimeoutMs: RUN_LIMITS.stepTimeoutMs,
  };
  await fs.mkdir(runDir(record.runId), { recursive: true });
  await saveRun(record);
  await fs.writeFile(eventsPath(record.runId), "");
  await rotateRuns(runsRoot(), RUN_LIMITS.maxKeptRuns);
  return record;
}

export async function saveRun(record: RunRecord): Promise<void> {
  await fs.mkdir(runDir(record.runId), { recursive: true });
  await fs.writeFile(metaPath(record.runId), `${JSON.stringify(record, null, 2)}\n`);
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  try {
    const raw = await fs.readFile(metaPath(runId), "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<RunRecord[]> {
  await fs.mkdir(runsRoot(), { recursive: true });
  const names = await fs.readdir(runsRoot());
  const items: RunRecord[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const record = await getRun(name);
    if (record) items.push(record);
  }
  return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function appendEvent(runId: string, event: RunnerEvent): Promise<void> {
  await fs.appendFile(eventsPath(runId), `${JSON.stringify(event)}\n`);
}

export async function readEvents(runId: string): Promise<RunnerEvent[]> {
  try {
    const raw = await fs.readFile(eventsPath(runId), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunnerEvent);
  } catch {
    return [];
  }
}

export function eventsWriteStream(runId: string) {
  return createWriteStream(eventsPath(runId), { flags: "a" });
}

export function videoFile(runId: string): string {
  return path.join(runDir(runId), "video.webm");
}

export async function deleteRun(runId: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(runId)) return false;
  const record = await getRun(runId);
  if (!record) return false;
  await fs.rm(runDir(runId), { recursive: true, force: true });
  return true;
}
