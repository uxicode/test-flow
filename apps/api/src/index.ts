import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { ExcelTestCase } from "./excelTestCaseTypes.js";
import type { Step } from "./scenarioStore.js";
import {
  createScenario,
  deleteScenario,
  ensureScenariosDir,
  getScenario,
  listScenarios,
  updateScenario,
} from "./scenarioStore.js";
import { generateSpec } from "./specGenerator.js";
import { codegenScriptToSteps } from "./codegenToSteps.js";
import { stepsToSmartTC } from "./tcGenerator.js";
import {
  startCodegenSession,
  startHostedRecordSession,
  stopCodegenSession,
  stopHostedRecordSession,
} from "./recordingSessions.js";
import {
  parseExcelTestCasesArray,
  parseTestCasesFromJsonBody,
} from "./excelBodyValidate.js";
import { parseExcelBuffer } from "./excelParser.js";
import {
  generateMergedSpecFromTestCases,
  generateSpecFilesFromTestCases,
} from "./excelPlaywrightGenerator.js";
import { zipGeneratedSpecs } from "./excelZip.js";

// ---------------------------------------------------------------------------
// 구성
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot =
  process.env.TESTFLOW_REPO_ROOT ??
  path.resolve(__dirname, "..", "..", "..");
const dataRunsRoot =
  process.env.TESTFLOW_DATA_DIR ?? path.join(repoRoot, "data", "runs");
const scenariosDir =
  process.env.TESTFLOW_SCENARIOS_DIR ?? path.join(repoRoot, "data", "scenarios");
const recordingsDir =
  process.env.TESTFLOW_RECORDINGS_DIR ?? path.join(repoRoot, "data", "recordings");
const playwrightRunnerDir =
  process.env.TESTFLOW_PLAYWRIGHT_RUNNER_DIR ??
  path.join(repoRoot, "packages", "playwright-runner");
const webDistDir =
  process.env.TESTFLOW_WEB_DIST_DIR ??
  path.join(repoRoot, "apps", "web", "dist");
const playwrightConfigPath = path.join(
  playwrightRunnerDir,
  "playwright.config.ts",
);

// ---------------------------------------------------------------------------
// 실행 상태
// ---------------------------------------------------------------------------

type RunStatus = "queued" | "running" | "passed" | "failed" | "error";

interface RunRecord {
  id: string;
  /** 시나리오별 실행 기록 필터용 (구버전 run.json에는 없을 수 있음) */
  scenarioId?: string;
  status: RunStatus;
  log: string;
  exitCode: number | null;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}

const runs = new Map<string, RunRecord>();
const subscribers = new Map<string, Set<(payload: string) => void>>();

function getRunArtifactsDir(runId: string): string {
  return path.join(dataRunsRoot, runId);
}

/** Reject path traversal: runId must be a single directory name under dataRunsRoot. */
function isSafeRunId(runId: string): boolean {
  if (!runId || runId !== path.basename(runId)) return false;
  if (runId.includes("/") || runId.includes("\\") || runId.includes(".."))
    return false;
  return true;
}

async function persistRunRecord(runId: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;
  const dir = getRunArtifactsDir(runId);
  await ensureDir(dir);
  await fs.writeFile(
    path.join(dir, "run.json"),
    JSON.stringify(run, null, 2),
    "utf8",
  );
}

async function loadRunRecordFromDisk(runId: string): Promise<RunRecord | null> {
  if (!isSafeRunId(runId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(getRunArtifactsDir(runId), "run.json"),
      "utf8",
    );
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

/** List runs from disk, newest first. Dirs without run.json get a placeholder row from mtime. */
async function listPersistedRuns(): Promise<RunRecord[]> {
  let entries;
  try {
    entries = await fs.readdir(dataRunsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: RunRecord[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    if (!isSafeRunId(id)) continue;
    let record = await loadRunRecordFromDisk(id);
    if (!record) {
      try {
        const st = await fs.stat(path.join(dataRunsRoot, id));
        const t = st.mtime.toISOString();
        record = {
          id,
          scenarioId: undefined,
          status: "passed",
          log: "",
          exitCode: null,
          startedAt: t,
          finishedAt: t,
        };
      } catch {
        continue;
      }
    }
    out.push(record);
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return out;
}

async function getRunRecordForApi(runId: string): Promise<RunRecord | null> {
  if (!isSafeRunId(runId)) return null;
  const mem = runs.get(runId);
  if (mem) return mem;
  return loadRunRecordFromDisk(runId);
}

/** Normalize spec text for byte comparison (line endings, BOM, trim). */
function normalizeSpecForCompare(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trim();
}

async function readRunScenarioSpec(runId: string): Promise<string | null> {
  if (!isSafeRunId(runId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(getRunArtifactsDir(runId), "scenario.spec.ts"),
      "utf8",
    );
    return normalizeSpecForCompare(raw);
  } catch {
    return null;
  }
}

/** Spec text the scenario would produce today (Excel TC, then script, then builder). */
async function expectedSpecSnapshotForScenario(
  scenarioId: string,
): Promise<string | null> {
  const s = await getScenario(scenariosDir, scenarioId);
  if (!s) return null;
  const excel = s.excelTestCases ?? [];
  if (excel.length > 0) {
    return normalizeSpecForCompare(generateMergedSpecFromTestCases(excel));
  }
  if (s.mode === "script" && s.rawScript.trim() !== "") {
    return normalizeSpecForCompare(s.rawScript);
  }
  if (s.steps.length > 0) {
    return normalizeSpecForCompare(generateSpec(s.steps));
  }
  return null;
}

/**
 * run.json의 scenarioId가 없는(구버전) 실행은 scenario.spec.ts 내용이
 * 지금 시나리오와 같으면 같은 시나리오 실행으로 간주합니다.
 */
async function persistedRunMatchesScenarioFilter(
  record: RunRecord,
  scenarioId: string,
): Promise<boolean> {
  if (record.scenarioId === scenarioId) return true;
  if (record.scenarioId != null && record.scenarioId !== "") return false;
  const [expected, actual] = await Promise.all([
    expectedSpecSnapshotForScenario(scenarioId),
    readRunScenarioSpec(record.id),
  ]);
  if (!expected || !actual) return false;
  return expected === actual;
}

function subscribe(runId: string, send: (payload: string) => void): () => void {
  let set = subscribers.get(runId);
  if (!set) {
    set = new Set();
    subscribers.set(runId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
    if (set!.size === 0) subscribers.delete(runId);
  };
}

function broadcast(runId: string, payload: object): void {
  const line = JSON.stringify(payload);
  for (const fn of subscribers.get(runId) ?? []) fn(line);
}

function appendLog(runId: string, chunk: string): void {
  const run = runs.get(runId);
  if (!run) return;
  run.log += chunk;
  broadcast(runId, { type: "log", chunk });
}

// ---------------------------------------------------------------------------
// 실행 요청에 대한 spec 해석
// ---------------------------------------------------------------------------

async function resolveSpecContent(body: {
  scenarioId?: string;
  steps?: Step[];
  rawScript?: string;
  excelTestCasesFromBody?: ExcelTestCase[] | null;
  baseUrl?: string;
}): Promise<string | undefined> {
  const fromBody = body.excelTestCasesFromBody;
  if (fromBody !== undefined && fromBody !== null) {
    if (fromBody.length > 0)
      return generateMergedSpecFromTestCases(fromBody, body.baseUrl);
  } else if (body.scenarioId) {
    const s0 = await getScenario(scenariosDir, body.scenarioId);
    if (s0) {
      const stored = s0.excelTestCases ?? [];
      if (stored.length > 0)
        return generateMergedSpecFromTestCases(stored, body.baseUrl);
    }
  }

  if (typeof body.rawScript === "string" && body.rawScript.trim() !== "")
    return body.rawScript;

  if (Array.isArray(body.steps) && body.steps.length > 0)
    return generateSpec(body.steps);

  if (body.scenarioId) {
    const s = await getScenario(scenariosDir, body.scenarioId);
    if (!s) return undefined;
    if (s.mode === "script" && s.rawScript.trim() !== "") return s.rawScript;
    if (s.steps.length > 0) return generateSpec(s.steps);
    return undefined;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function guessContentType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function resolveArtifactPath(runId: string, relative: string): string | null {
  const base = path.resolve(getRunArtifactsDir(runId));
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

const MAX_SCREENSHOT_URLS = 24;
const MAX_VIDEO_URLS = 8;

/** 실행 산출물 루트 기준 .png 상대 경로 수집(UI 미리보기용). */
async function collectScreenshotRelPaths(runId: string): Promise<string[]> {
  const root = path.resolve(getRunArtifactsDir(runId));
  const collected: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (collected.length >= MAX_SCREENSHOT_URLS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (collected.length >= MAX_SCREENSHOT_URLS) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".png")) {
        const rel = path.relative(root, full);
        const norm = rel.split(path.sep).join("/");
        if (!norm.startsWith("..") && norm.length > 0) collected.push(norm);
      }
    }
  }

  const testResults = path.join(root, "test-results");
  try {
    await fs.access(testResults);
    await walk(testResults);
  } catch {
    /* 아직 폴더 없음 */
  }

  collected.sort();
  return collected;
}

/** 실행 산출물 루트 기준 .webm 상대 경로 수집. */
async function collectVideoRelPaths(runId: string): Promise<string[]> {
  const root = path.resolve(getRunArtifactsDir(runId));
  const collected: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (collected.length >= MAX_VIDEO_URLS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (collected.length >= MAX_VIDEO_URLS) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".webm")) {
        const rel = path.relative(root, full);
        const norm = rel.split(path.sep).join("/");
        if (!norm.startsWith("..") && norm.length > 0) collected.push(norm);
      }
    }
  }

  const testResults = path.join(root, "test-results");
  try {
    await fs.access(testResults);
    await walk(testResults);
  } catch {
    /* 폴더 없음 */
  }

  collected.sort();
  return collected;
}

// ---------------------------------------------------------------------------
// 로컬 Playwright 실행 (Docker 없음)
// ---------------------------------------------------------------------------

async function executeRun(runId: string, specContent?: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;

  const hostArtifacts = getRunArtifactsDir(runId);
  await ensureDir(hostArtifacts);
  await ensureDir(path.join(hostArtifacts, "test-results"));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ARTIFACTS_DIR: hostArtifacts,
    TESTFLOW_RUN_VIDEO: "always",
  };

  if (specContent) {
    await fs.writeFile(
      path.join(hostArtifacts, "scenario.spec.ts"),
      specContent,
      "utf8",
    );
    env.TEST_DIR = hostArtifacts;
  }

  run.status = "running";
  broadcast(runId, { type: "status", status: run.status });
  await persistRunRecord(runId);

  const args = ["playwright", "test", "--config", playwrightConfigPath];

  try {
    await new Promise<void>((resolve) => {
      const child = spawn("npx", args, {
        cwd: playwrightRunnerDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      child.stdout?.on("data", (buf: Buffer) => {
        appendLog(runId, buf.toString("utf8"));
      });
      child.stderr?.on("data", (buf: Buffer) => {
        appendLog(runId, buf.toString("utf8"));
      });

      child.on("error", (err) => {
        const message = err instanceof Error ? err.message : String(err);
        run.status = "error";
        run.exitCode = null;
        run.errorMessage = message;
        run.finishedAt = new Date().toISOString();
        appendLog(runId, `\n[testflow] ${message}\n`);
        broadcast(runId, {
          type: "complete",
          status: run.status,
          errorMessage: message,
        });
        void persistRunRecord(runId).finally(() => resolve());
      });

      child.on("exit", (code, signal) => {
        if (signal)
          appendLog(runId, `\n[testflow] child exited with signal ${signal}\n`);
        const exitCode = code === null ? -1 : code;
        run.exitCode = exitCode;
        run.status = exitCode === 0 ? "passed" : "failed";
        run.finishedAt = new Date().toISOString();
        broadcast(runId, { type: "complete", status: run.status, exitCode });
        void persistRunRecord(runId).finally(() => resolve());
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run.status = "error";
    run.exitCode = null;
    run.errorMessage = message;
    run.finishedAt = new Date().toISOString();
    appendLog(runId, `\n[testflow] ${message}\n`);
    broadcast(runId, { type: "complete", status: run.status, errorMessage: message });
    await persistRunRecord(runId);
  }
}

// ---------------------------------------------------------------------------
// Fastify 서버
// ---------------------------------------------------------------------------

const fastify = Fastify({ logger: true });

let appPrepared = false;

async function prepareApp(): Promise<void> {
  if (appPrepared) return;

  await ensureScenariosDir(scenariosDir);
  await fs.mkdir(recordingsDir, { recursive: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  await fastify.register(websocket);

  fastify.get("/health", async () => ({ ok: true }));

// --- 시나리오 CRUD ---

fastify.get("/api/scenarios", async () => {
  return await listScenarios(scenariosDir);
});

fastify.post("/api/scenarios", async (req, reply) => {
  const body = (req.body ?? {}) as {
    name?: string;
    mode?: "builder" | "script";
    steps?: Step[];
    rawScript?: string;
    excelTestCases?: unknown;
  };
  let excelTestCases: ExcelTestCase[] | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "excelTestCases")) {
    const parsed = parseExcelTestCasesArray(body.excelTestCases);
    if (parsed === null) {
      return reply.code(400).send({
        error: "invalid_excel_test_cases",
        message: "excelTestCases must be an array of ExcelTestCase objects.",
      });
    }
    excelTestCases = parsed;
  }
  const scenario = await createScenario(scenariosDir, {
    name: body.name ?? "New scenario",
    mode: body.mode,
    steps: body.steps,
    rawScript: body.rawScript,
    excelTestCases,
  });
  return reply.code(201).send(scenario);
});

fastify.get("/api/scenarios/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const scenario = await getScenario(scenariosDir, id);
  if (!scenario) return reply.code(404).send({ error: "not_found" });
  return scenario;
});

fastify.put("/api/scenarios/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = (req.body ?? {}) as Partial<{
    name: string;
    mode: "builder" | "script";
    steps: Step[];
    rawScript: string;
    excelTestCases: unknown;
  }>;
  const patch: Parameters<typeof updateScenario>[2] = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.mode !== undefined) patch.mode = body.mode;
  if (body.steps !== undefined) patch.steps = body.steps;
  if (body.rawScript !== undefined) patch.rawScript = body.rawScript;
  if (Object.prototype.hasOwnProperty.call(body, "excelTestCases")) {
    const parsed = parseExcelTestCasesArray(body.excelTestCases);
    if (parsed === null) {
      return reply.code(400).send({
        error: "invalid_excel_test_cases",
        message: "excelTestCases must be an array of ExcelTestCase objects.",
      });
    }
    patch.excelTestCases = parsed;
  }
  const updated = await updateScenario(scenariosDir, id, patch);
  if (!updated) return reply.code(404).send({ error: "not_found" });
  return updated;
});

fastify.delete("/api/scenarios/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const ok = await deleteScenario(scenariosDir, id);
  if (!ok) return reply.code(404).send({ error: "not_found" });
  return reply.code(204).send();
});

// GET /api/scenarios/:id/tc — 시나리오 스텝을 SmartTC JSON으로 반환
fastify.get("/api/scenarios/:id/tc", async (req, reply) => {
  const { id } = req.params as { id: string };
  const scenario = await getScenario(scenariosDir, id);
  if (!scenario) return reply.code(404).send({ error: "not_found" });
  if (scenario.mode !== "builder" || scenario.steps.length === 0) {
    return reply.code(400).send({ error: "no_steps", message: "builder 모드에 스텝이 있어야 합니다." });
  }
  const tc = stepsToSmartTC(scenario.steps);
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    totalSteps: tc.length,
    tc,
  };
});

// POST /api/tc/convert — 임의 스텝 배열을 SmartTC로 변환 (빌더 없이 바로 변환)
fastify.post("/api/tc/convert", async (req, reply) => {
  const body = (req.body ?? {}) as { steps?: Step[] };
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return reply.code(400).send({ error: "steps_required" });
  }
  const tc = stepsToSmartTC(body.steps);
  return { totalSteps: tc.length, tc };
});

// --- Excel → Playwright (.spec.ts codegen only) ---

fastify.post("/api/excel/parse", async (req, reply) => {
  let fileBuffer: Buffer | null = null;
  let sheetNamesJson: string | undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "file") {
          fileBuffer = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      } else if (part.fieldname === "sheetNames") {
        sheetNamesJson = String(part.value ?? "");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: "multipart_read_failed", message });
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return reply.code(400).send({ error: "file_required" });
  }

  let sheetNames: string[] | undefined;
  if (sheetNamesJson && sheetNamesJson.trim()) {
    try {
      const parsed = JSON.parse(sheetNamesJson) as unknown;
      if (
        !Array.isArray(parsed) ||
        !parsed.every((x): x is string => typeof x === "string")
      ) {
        return reply.code(400).send({ error: "invalid_sheetNames" });
      }
      sheetNames = parsed;
    } catch {
      return reply.code(400).send({ error: "invalid_sheetNames_json" });
    }
  }

  const { features, diagnostics } = parseExcelBuffer(fileBuffer, sheetNames);
  return { features, diagnostics };
});

fastify.post("/api/excel/generate", async (req, reply) => {
  const testCases = parseTestCasesFromJsonBody(req.body);
  if (!testCases) {
    return reply.code(400).send({
      error: "testCases_required",
      message:
        "Body must be { testCases: ExcelTestCase[] } (feature, sheetName, policyId, cases[]).",
    });
  }
  const files = generateSpecFilesFromTestCases(testCases);
  const zip = await zipGeneratedSpecs(files);
  return reply
    .header("content-type", "application/zip")
    .header(
      "content-disposition",
      'attachment; filename="generated-tests.zip"',
    )
    .send(zip);
});

// --- 녹화 ---

fastify.post("/api/sessions/record", async (req, reply) => {
  const body = (req.body ?? {}) as {
    url?: string;
    mode?: "codegen" | "hosted";
    scenarioId?: string;
  };
  const url = body.url ?? "";
  const mode = body.mode ?? "hosted";
  if (body.scenarioId) {
    const exists = await getScenario(scenariosDir, body.scenarioId);
    if (!exists) return reply.code(404).send({ error: "scenario_not_found" });
  }
  const result =
    mode === "hosted"
      ? await startHostedRecordSession(playwrightRunnerDir, recordingsDir, url, {
          scenarioId: body.scenarioId,
        })
      : await startCodegenSession(playwrightRunnerDir, recordingsDir, url);
  if ("error" in result) return reply.code(400).send(result);
  return result;
});

async function mergeRecordingMetaOnStop(
  sessionId: string,
  bodyScenarioId?: string,
): Promise<void> {
  if (!isSafeRunId(sessionId)) return;
  const dir = path.join(recordingsDir, sessionId);
  const metaPath = path.join(dir, "recording.json");
  let meta: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    meta = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    meta = { startedAt: new Date().toISOString() };
  }
  if (bodyScenarioId && (meta.scenarioId == null || meta.scenarioId === "")) {
    meta.scenarioId = bodyScenarioId;
  }
  meta.stoppedAt = new Date().toISOString();
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
}

interface RecordingListItem {
  sessionId: string;
  kind: "hosted";
  scenarioId: string | null;
  startedAt: string;
  stoppedAt?: string;
  videoUrl: string;
  stepsJsonUrl: string;
  smartTcJsonUrl: string;
}

interface RecordingMetaFile {
  scenarioId?: string | null;
  startedAt?: string;
  stoppedAt?: string;
}

async function legacyRecordingMatchesScenario(
  sessionId: string,
  scenarioId: string,
): Promise<boolean> {
  const metaPath = path.join(recordingsDir, sessionId, "recording.json");
  try {
    await fs.access(metaPath);
    return false;
  } catch {
    /* no recording.json — may be 구버전 폴더 */
  }
  let fileSteps: Step[] = [];
  try {
    const raw = await fs.readFile(
      path.join(recordingsDir, sessionId, "steps.json"),
      "utf8",
    );
    fileSteps = JSON.parse(raw) as Step[];
  } catch {
    return false;
  }
  const s = await getScenario(scenariosDir, scenarioId);
  if (!s || s.mode !== "builder" || s.steps.length === 0) return false;
  return JSON.stringify(s.steps) === JSON.stringify(fileSteps);
}

async function listRecordingsForScenario(
  scenarioId: string,
): Promise<RecordingListItem[]> {
  let entries;
  try {
    entries = await fs.readdir(recordingsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: RecordingListItem[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sessionId = e.name;
    if (!isSafeRunId(sessionId)) continue;
    const metaPath = path.join(recordingsDir, sessionId, "recording.json");
    let meta: RecordingMetaFile | null = null;
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      meta = JSON.parse(raw) as RecordingMetaFile;
    } catch {
      meta = null;
    }

    let include = false;
    if (meta && meta.scenarioId === scenarioId) include = true;
    else if (!meta && (await legacyRecordingMatchesScenario(sessionId, scenarioId)))
      include = true;
    if (!include) continue;

    const base = `/api/recordings/${sessionId}`;
    let videoUrl = "";
    try {
      const videoDir = path.join(recordingsDir, sessionId, "video");
      const names = await fs.readdir(videoDir);
      const webm = names.find((n) => n.toLowerCase().endsWith(".webm"));
      if (webm) videoUrl = `${base}/video/${webm}`;
    } catch {
      /* no video */
    }

    let startedAt = meta?.startedAt ?? new Date(0).toISOString();
    if (!meta?.startedAt) {
      try {
        const st = await fs.stat(path.join(recordingsDir, sessionId, "steps.json"));
        startedAt = st.mtime.toISOString();
      } catch {
        /* keep default */
      }
    }

    out.push({
      sessionId,
      kind: "hosted",
      scenarioId: meta?.scenarioId ?? scenarioId,
      startedAt,
      stoppedAt: meta?.stoppedAt,
      videoUrl,
      stepsJsonUrl: `${base}/steps.json`,
      smartTcJsonUrl: `${base}/smartTc.json`,
    });
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return out;
}

fastify.get("/api/recordings", async (req, reply) => {
  const scenarioId = (req.query as { scenarioId?: string }).scenarioId;
  if (typeof scenarioId !== "string" || scenarioId === "") {
    return reply.code(400).send({ error: "scenarioId_required" });
  }
  const exists = await getScenario(scenariosDir, scenarioId);
  if (!exists) return reply.code(404).send({ error: "scenario_not_found" });
  return await listRecordingsForScenario(scenarioId);
});

fastify.post("/api/sessions/:sessionId/stop", async (req, reply) => {
  const { sessionId } = req.params as { sessionId: string };
  const stopBody = (req.body ?? {}) as { scenarioId?: string };
  const codegenResult = await stopCodegenSession(sessionId, recordingsDir);
  if (!("error" in codegenResult)) {
    const { steps, warnings } = codegenScriptToSteps(codegenResult.script);
    return {
      script: codegenResult.script,
      steps,
      smartTc: stepsToSmartTC(steps),
      parseWarnings: warnings,
      sessionKind: "codegen" as const,
      sessionArtifacts: { videoUrl: "" },
    };
  }
  const hosted = await stopHostedRecordSession(sessionId, recordingsDir);
  if (!("error" in hosted)) {
    await mergeRecordingMetaOnStop(sessionId, stopBody.scenarioId);
    const smartTc = stepsToSmartTC(hosted.steps);
    const smartPath = path.join(recordingsDir, sessionId, "smartTc.json");
    await fs.writeFile(smartPath, JSON.stringify(smartTc, null, 2), "utf8");
    return {
      ...hosted,
      smartTc,
    };
  }
  return reply.code(400).send({
    error: `${codegenResult.error}; ${hosted.error}`,
  });
});

fastify.get("/api/recordings/:sessionId/*", async (req, reply) => {
  const { sessionId } = req.params as { sessionId: string; "*": string };
  const wildcard = (req.params as Record<string, string>)["*"] ?? "";
  const base = path.resolve(recordingsDir, sessionId);
  const safe = path.normalize(wildcard).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.resolve(base, safe);
  if (!filePath.startsWith(base + path.sep) && filePath !== base)
    return reply.code(400).send({ error: "invalid_path" });

  if (safe === "smartTc.json" || safe.endsWith("/smartTc.json")) {
    try {
      await fs.access(filePath);
    } catch {
      try {
        const raw = await fs.readFile(path.join(base, "steps.json"), "utf8");
        const steps = JSON.parse(raw) as Step[];
        const tc = stepsToSmartTC(steps);
        await fs.writeFile(filePath, JSON.stringify(tc, null, 2), "utf8");
      } catch {
        /* 404 below */
      }
    }
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return reply.code(404).send({ error: "not_found" });
    reply.header("content-type", guessContentType(filePath));
    return reply.send(createReadStream(filePath));
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }
});

// --- 실행(runs) ---

fastify.post("/api/runs", async (req, reply) => {
  const body = (req.body ?? {}) as {
    scenarioId?: string;
    steps?: Step[];
    rawScript?: string;
    excelTestCases?: unknown;
    baseUrl?: string;
  };

  if (body.scenarioId) {
    const exists = await getScenario(scenariosDir, body.scenarioId);
    if (!exists) return reply.code(404).send({ error: "scenario_not_found" });
  }

  let excelTestCasesFromBody: ExcelTestCase[] | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(body, "excelTestCases")) {
    const parsed = parseExcelTestCasesArray(body.excelTestCases);
    if (parsed === null) {
      return reply.code(400).send({
        error: "invalid_excel_test_cases",
        message: "excelTestCases must be an array of ExcelTestCase objects.",
      });
    }
    excelTestCasesFromBody = parsed;
  }

  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim() !== ""
      ? body.baseUrl.trim()
      : undefined;

  const specContent = await resolveSpecContent({
    scenarioId: body.scenarioId,
    steps: body.steps,
    rawScript: body.rawScript,
    excelTestCasesFromBody,
    baseUrl,
  });

  const runId = randomUUID();
  const run: RunRecord = {
    id: runId,
    scenarioId: body.scenarioId,
    status: "queued",
    log: "",
    exitCode: null,
    startedAt: new Date().toISOString(),
  };
  runs.set(runId, run);
  await persistRunRecord(runId);

  void executeRun(runId, specContent);

  return reply.code(202).send({ runId });
});

fastify.get("/api/runs", async (req) => {
  const scenarioId =
    typeof (req.query as { scenarioId?: string }).scenarioId === "string"
      ? (req.query as { scenarioId: string }).scenarioId
      : undefined;
  const rows = await listPersistedRuns();
  let filtered = rows;
  if (scenarioId != null && scenarioId !== "") {
    const out: RunRecord[] = [];
    for (const r of rows) {
      if (await persistedRunMatchesScenarioFilter(r, scenarioId)) out.push(r);
    }
    filtered = out;
  }
  return filtered.map((r) => ({
    id: r.id,
    scenarioId: r.scenarioId,
    status: r.status,
    exitCode: r.exitCode,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }));
});

fastify.get("/api/runs/:runId/script", async (req, reply) => {
  const { runId } = req.params as { runId: string };
  if (!isSafeRunId(runId)) return reply.code(400).send({ error: "invalid_run_id" });
  const specPath = path.join(getRunArtifactsDir(runId), "scenario.spec.ts");
  try {
    const content = await fs.readFile(specPath, "utf8");
    reply.header("content-type", "text/plain; charset=utf-8");
    return reply.send(content);
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }
});

fastify.delete("/api/runs/:runId", async (req, reply) => {
  const { runId } = req.params as { runId: string };
  if (!isSafeRunId(runId)) return reply.code(400).send({ error: "invalid_run_id" });
  const dir = getRunArtifactsDir(runId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    return reply.code(500).send({ error: "delete_failed" });
  }
  runs.delete(runId);
  subscribers.delete(runId);
  return reply.code(204).send();
});

fastify.get("/api/runs/:runId", async (req, reply) => {
  const { runId } = req.params as { runId: string };
  const run = await getRunRecordForApi(runId);
  if (!run) return reply.code(404).send({ error: "not_found" });
  const base = `/api/runs/${runId}/artifacts`;
  const relPngs = await collectScreenshotRelPaths(runId);
  const screenshotUrls = relPngs.map((rel) => `${base}/${rel}`);
  const relWebms = await collectVideoRelPaths(runId);
  const videoUrls = relWebms.map((rel) => `${base}/${rel}`);
  return {
    id: run.id,
    scenarioId: run.scenarioId,
    status: run.status,
    exitCode: run.exitCode,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    log: run.log,
    artifacts: {
      reportIndex: `${base}/playwright-report/index.html`,
      testResultsDir: `${base}/test-results`,
      screenshotUrls,
      videoUrls,
    },
  };
});

fastify.get("/api/runs/:runId/artifacts/*", async (req, reply) => {
  const { runId } = req.params as { runId: string; "*": string };
  const wildcard = (req.params as Record<string, string>)["*"] ?? "";
  const safe = path.normalize(wildcard).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = resolveArtifactPath(runId, safe);
  if (!filePath) return reply.code(400).send({ error: "invalid_path" });

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return reply.code(404).send({ error: "not_found" });
    reply.header("content-type", guessContentType(filePath));
    return reply.send(createReadStream(filePath));
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }
});

fastify.get("/ws/runs/:runId", { websocket: true }, (socket, req) => {
  const { runId } = req.params as { runId: string };
  void (async () => {
    const run = await getRunRecordForApi(runId);
    if (!run) {
      socket.close(1008, "unknown_run");
      return;
    }

    const send = (payload: string) => {
      try {
        socket.send(payload);
      } catch {
        /* 무시 */
      }
    };

    const unsubscribe = subscribe(runId, send);
    send(JSON.stringify({ type: "snapshot", status: run.status, log: run.log }));
    socket.on("close", unsubscribe);
  })();
});

  const webIndex = path.join(webDistDir, "index.html");
  try {
    await fs.access(webIndex);
    await fastify.register(staticPlugin, {
      root: webDistDir,
      prefix: "/",
      wildcard: false,
      decorateReply: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      const url = (req.url ?? "").split("?")[0] ?? "";
      if (
        url.startsWith("/api") ||
        url.startsWith("/ws") ||
        url === "/health"
      )
        return reply.code(404).send({ error: "not_found" });
      return reply.sendFile("index.html");
    });
  } catch {
    fastify.log.info(
      { webDistDir },
      "Web dist not found; use Vite dev server for UI (pnpm dev).",
    );
  }

  appPrepared = true;
}

export async function startServer(options?: {
  port?: number;
  host?: string;
}): Promise<void> {
  await prepareApp();
  const port = options?.port ?? Number(process.env.PORT ?? 3001);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";
  await fastify.listen({ port, host });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await startServer({
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
  });
}
