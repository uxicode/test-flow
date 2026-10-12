import "@fastify/websocket";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createOllamaWorker, runAnalysisJob, textModel, visionModel } from "@testflow/analyze";
import { inspectSelector, runTestCase } from "@testflow/runner";
import { buildTestCases, parseControlKind, type TestCase, type TcInput, type TcTableAssert } from "@testflow/tc";
import { getJob, saveJob } from "./job-store.js";
import { publishLog, readLogs, subscribeLog } from "./log-hub.js";

interface RunState {
  runId: string;
  jobId: string;
  caseId: string;
  status: string;
  report: string;
  steps: string[];
  controller: AbortController;
}

const runs = new Map<string, RunState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/analysis", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const url = typeof body.url === "string" ? body.url : "";
    const token = typeof body.token === "string" ? body.token : "";
    const specText = typeof body.specText === "string" ? body.specText : "";
    if ((!url || !token) && !specText.trim())
      return reply.code(400).send({ error: "Figma URL·토큰 또는 텍스트 기획서가 필요합니다." });
    const jobId = randomUUID();
    const controller = new AbortController();
    saveJob({ jobId, status: "fetching", cases: [], controller });
    const textWorker = createOllamaWorker({ model: textModel() });
    const visionWorker = createOllamaWorker({ model: visionModel() });
    void runAnalysisJob({
      jobId,
      ...(url && token ? { url, token } : {}),
      ...(specText.trim() ? { specText } : {}),
      worker: textWorker,
      textWorker,
      visionWorker,
      textModel: textModel(),
      visionModel: visionModel(),
      signal: controller.signal,
      onEvent: (event) => {
        publishLog(jobId, event.message);
        const job = getJob(jobId);
        if (!job) return;
        if (event.status) job.status = event.status;
        if (event.result) {
          job.result = event.result;
          if (event.status === "completed" || event.status === "cancelled") {
            job.cases = buildTestCases(event.result.screens);
            publishLog(jobId, `TC ${job.cases.length}개 작성`);
          }
        }
      },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "분석에 실패했습니다.";
      publishLog(jobId, message);
      const job = getJob(jobId);
      if (job) job.status = "failed";
    });
    return reply.code(202).send({ jobId });
  });

  app.post("/api/analysis/:jobId/cancel", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = getJob(jobId);
    if (!job) return reply.code(404).send({ error: "작업을 찾지 못했습니다." });
    job.controller.abort();
    return { ok: true };
  });

  app.get("/api/analysis/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = getJob(jobId);
    if (!job) return reply.code(404).send({ error: "작업을 찾지 못했습니다." });
    return {
      jobId: job.jobId,
      status: job.status,
      screens: job.result?.screens ?? [],
      cases: job.cases,
    };
  });

  app.post("/api/runs", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const caseId = typeof body.caseId === "string" ? body.caseId : "";
    const startUrl = typeof body.startUrl === "string" ? body.startUrl : "";
    const values = isRecord(body.values)
      ? Object.fromEntries(
          Object.entries(body.values).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
    const loginEmail = typeof body.loginEmail === "string" ? body.loginEmail.trim() : "";
    const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
    const login = loginEmail && loginPassword ? { email: loginEmail, password: loginPassword } : undefined;
    if (!/^https?:\/\//iu.test(startUrl))
      return reply.code(400).send({ error: "http(s) 시작 URL이 필요합니다." });
    const job = getJob(jobId);
    const testCase = job?.cases.find((item) => item.id === caseId);
    if (!testCase) return reply.code(404).send({ error: "TC를 찾지 못했습니다." });

    const apiPath = typeof body.apiPath === "string" ? body.apiPath.trim() : undefined;
    let assert: TcTableAssert | undefined;
    if (isRecord(body.assert) && typeof body.assert.column === "string" && typeof body.assert.value === "string") {
      assert = {
        type: "table",
        column: String(body.assert.column).trim(),
        every: body.assert.every === "contains" ? "contains" : "equals",
        value: String(body.assert.value).trim(),
        minRows: typeof body.assert.minRows === "number" ? body.assert.minRows : Number(body.assert.minRows) || 1,
      };
    }
    const optionContainerSelector =
      typeof body.optionContainerSelector === "string" ? body.optionContainerSelector.trim() : undefined;
    const inputsOverride = parseInputsOverride(body.inputs);

    const mergedCase: TestCase = {
      ...testCase,
      ...(apiPath !== undefined ? { apiPath } : {}),
      ...(assert !== undefined ? { assert } : {}),
      ...(optionContainerSelector !== undefined ? { optionContainerSelector } : {}),
      ...(inputsOverride ? { inputs: inputsOverride } : {}),
    };

    const runId = randomUUID();
    const controller = new AbortController();
    const state: RunState = { runId, jobId, caseId, status: "running", report: "", steps: [], controller };
    runs.set(runId, state);
    void runOne(state, mergedCase, startUrl, values, login);
    return reply.code(202).send({ runId });
  });

  app.post("/api/runs/:runId/cancel", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const state = runs.get(runId);
    if (!state) return reply.code(404).send({ error: "실행을 찾지 못했습니다." });
    if (state.status === "running") {
      state.controller.abort();
      state.status = "cancelled";
    }
    return { ok: true };
  });

  app.get("/api/runs/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const state = runs.get(runId);
    if (!state) return reply.code(404).send({ error: "실행을 찾지 못했습니다." });
    return {
      runId: state.runId,
      caseId: state.caseId,
      status: state.status,
      report: state.report,
    };
  });

  app.post("/api/inspect-selector", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const startUrl = typeof body.startUrl === "string" ? body.startUrl.trim() : "";
    if (!/^https?:\/\//iu.test(startUrl)) {
      return reply.code(400).send({ error: "http(s) 시작 URL이 필요합니다." });
    }
    const loginEmail = typeof body.loginEmail === "string" ? body.loginEmail.trim() : "";
    const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
    const login = loginEmail && loginPassword ? { email: loginEmail, password: loginPassword } : undefined;

    try {
      const selector = await inspectSelector({ startUrl, login });
      return { selector };
    } catch (error) {
      const message = error instanceof Error ? error.message : "셀렉터 추출 실패";
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/ws/logs/:channelId", { websocket: true }, (socket, req) => {
    const { channelId } = req.params as { channelId: string };
    for (const event of readLogs(channelId)) socket.send(JSON.stringify(event));
    const unsubscribe = subscribeLog(channelId, (event) => {
      socket.send(JSON.stringify(event));
    });
    socket.on("close", unsubscribe);
  });
}

function parseInputsOverride(raw: unknown): TcInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: TcInput[] = [];
  for (const row of raw) {
    if (!isRecord(row) || typeof row.target !== "string" || !row.target.trim()) continue;
    const control = typeof row.control === "string" ? parseControlKind(row.control) : undefined;
    const options = Array.isArray(row.options)
      ? row.options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    const selector = typeof row.selector === "string" ? row.selector.trim() : undefined;
    parsed.push({
      target: row.target.trim(),
      value: typeof row.value === "string" ? row.value : "",
      ...(control ? { control } : {}),
      ...(options?.length ? { options } : {}),
      ...(selector ? { selector } : {}),
    });
  }
  return parsed.length > 0 ? parsed : undefined;
}

async function runOne(
  state: RunState,
  testCase: TestCase,
  startUrl: string,
  values: Record<string, string>,
  login: { email: string; password: string } | undefined,
): Promise<void> {
  const note = (message: string, runStatus = state.status) => {
    state.steps.push(message);
    state.report = state.steps.join("\n");
    const meta = { caseId: state.caseId, runStatus, report: state.report };
    publishLog(state.runId, message, meta);
    publishLog(state.jobId, message, meta);
  };
  note(`${testCase.title} 실행 시작`);
  try {
    await runTestCase({
      startUrl,
      testCase,
      values,
      ...(login ? { login } : {}),
      signal: state.controller.signal,
      onLog: (entry) => note(entry.message),
    });
    state.status = "passed";
    note(`${testCase.title} 통과`, "passed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 실패";
    const stopped = state.controller.signal.aborted || message === "사용자가 중지했습니다.";
    state.status = stopped ? "cancelled" : "failed";
    note(stopped ? "사용자가 중지했습니다." : `실패. ${message}`, state.status);
  }
}
