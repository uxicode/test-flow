import "@fastify/websocket";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createOllamaWorker, runAnalysisJob, textModel, visionModel } from "@testflow/analyze";
import {
  deleteElementMap,
  findLatestMapByUrl,
  inspectSelector,
  listElementMaps,
  loadElementMap,
  runExploreJob,
  runTestCase,
  upsertPinnedSelector,
} from "@testflow/runner";
import {
  applyReview,
  deleteMatchSet,
  findLatestMatchSet,
  listMatchSets,
  loadMatchSet,
  matchTcToMap,
  resetMatchReview,
  resolveApprovedLocator,
  saveMatchSet,
  saveMatchSetById,
  type MatchSet,
} from "@testflow/matcher";
import {
  CONTROL_KIND,
  buildTestCases,
  deleteTcFile,
  listTcFiles,
  loadTcFile,
  parseControlKind,
  saveTcFile,
  type ControlKind,
  type TcInput,
  type TcTableAssert,
  type TestCase,
} from "@testflow/tc";
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

interface ExploreState {
  exploreId: string;
  url: string;
  status: "running" | "completed" | "failed" | "cancelled";
  mapId?: string;
  error?: string;
  controller: AbortController;
}

interface MatchJobState {
  matchJobId: string;
  jobId: string;
  mapId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  matchId?: string;
  error?: string;
  controller: AbortController;
}

const runs = new Map<string, RunState>();
const explores = new Map<string, ExploreState>();
const matchJobs = new Map<string, MatchJobState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readToken(body: Record<string, unknown>): string {
  return typeof body.token === "string" ? body.token.trim() : "";
}

function readLogin(body: Record<string, unknown>): { email: string; password: string } | undefined {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return undefined;
  return { email, password };
}

/** 날짜 입력의 selector 는 달력 컨테이너 자리라서 매칭된 트리거 버튼을 넣지 않는다. */
function isDateControl(control: ControlKind | undefined): boolean {
  return control === CONTROL_KIND.date || control === CONTROL_KIND.dateRange;
}

/** 삭제된 매칭 결과가 TC 입력에 넣어 둔 셀렉터를 걷어 낸다. 사람이 직접 고른 셀렉터는 그대로 둔다. */
function removeMatchFromJob(set: MatchSet): void {
  const job = getJob(set.jobId);
  if (!job) return;
  const fromMatch = new Set(set.steps.flatMap((step) => step.candidates.map((candidate) => candidate.bestLocator.value)));
  job.cases = job.cases.map((testCase) => ({
    ...testCase,
    inputs: testCase.inputs.map((input) =>
      input.selector && fromMatch.has(input.selector)
        ? { ...input, selector: undefined, selectorStrategy: undefined }
        : input,
    ),
  }));
}

function applyMatchToJob(set: MatchSet): void {
  const job = getJob(set.jobId);
  if (!job) return;
  job.cases = job.cases.map((testCase) => ({
    ...testCase,
    inputs: testCase.inputs.map((input) => {
      if (isDateControl(input.control)) return input;
      const byId = set.steps.find((item) => item.tcId === testCase.id && item.stepLabel === input.target);
      const byLabel = set.steps.filter((item) => item.stepLabel === input.target);
      const step = byId ?? (byLabel.length === 1 ? byLabel[0] : undefined);
      if (!step) return input;
      if (step.status === "rejected" || step.chosenIndex < 0) {
        const fromMatch = step.candidates.some((candidate) => candidate.bestLocator.value === input.selector);
        if (!fromMatch) return input;
        return { ...input, selector: undefined, selectorStrategy: undefined };
      }
      const candidate = step.candidates[step.chosenIndex];
      if (!candidate?.bestLocator.value) return input;
      return {
        ...input,
        selector: candidate.bestLocator.value,
        selectorStrategy: candidate.bestLocator.strategy,
      };
    }),
  }));
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/analysis", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const url = typeof body.url === "string" ? body.url : "";
    const specText = typeof body.specText === "string" ? body.specText : "";
    const token = readToken(body);
    if ((!url || !token) && !specText.trim()) {
      if (url && !token) return reply.code(400).send({ error: "Figma 토큰을 입력하세요." });
      return reply.code(400).send({ error: "Figma URL 또는 텍스트 기획서가 필요합니다." });
    }
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
            try {
              saveTcFile(jobId, job.cases);
            } catch {
              // TC 파일 저장 실패는 분석 결과에 영향을 주지 않는다.
            }
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

  app.get("/api/tc-files", async () => {
    return { files: listTcFiles() };
  });

  app.get("/api/tc-files/:fileId", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    try {
      const tcFile = loadTcFile(fileId);
      // 분석 작업은 메모리에만 있어 API 재시작 뒤엔 사라진다. 매칭·실행이 이 jobId 를 쓰므로 다시 등록한다.
      if (!getJob(tcFile.jobId)) {
        saveJob({ jobId: tcFile.jobId, status: "completed", cases: tcFile.cases, controller: new AbortController() });
      }
      return tcFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : "TC 파일 로드 실패";
      return reply.code(404).send({ error: message });
    }
  });

  app.post("/api/tc-files", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const label = typeof body.label === "string" ? body.label.trim() : undefined;
    if (!jobId) return reply.code(400).send({ error: "jobId가 필요합니다." });
    const job = getJob(jobId);
    if (!job || job.cases.length === 0) return reply.code(404).send({ error: "저장할 TC가 없습니다." });
    try {
      const meta = saveTcFile(jobId, job.cases, label);
      return reply.code(201).send(meta);
    } catch (error) {
      const message = error instanceof Error ? error.message : "TC 파일 저장 실패";
      return reply.code(500).send({ error: message });
    }
  });

  app.delete("/api/tc-files/:fileId", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    try {
      deleteTcFile(fileId);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "TC 파일 삭제 실패";
      return reply.code(404).send({ error: message });
    }
  });

  // ── 화면 탐색 (Phase 2) ────────────────────────────────────────────────────

  app.post("/api/explore", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const startUrl = typeof body.startUrl === "string" ? body.startUrl.trim() : "";
    if (!/^https?:\/\//iu.test(startUrl)) {
      return reply.code(400).send({ error: "http(s) 시작 URL이 필요합니다." });
    }
    const exploreId = randomUUID();
    const controller = new AbortController();
    const state: ExploreState = { exploreId, url: startUrl, status: "running", controller };
    explores.set(exploreId, state);

    const login = readLogin(body);

    void (async () => {
      try {
        const mapId = await runExploreJob({
          startUrl,
          login,
          signal: controller.signal,
          headless: true,
          onLog: (msg) => publishLog(exploreId, msg),
        });
        state.status = "completed";
        state.mapId = mapId;
        publishLog(exploreId, `완료 (mapId: ${mapId})`);
      } catch (error) {
        if (controller.signal.aborted) {
          state.status = "cancelled";
        } else {
          state.status = "failed";
          state.error = error instanceof Error ? error.message : "탐색 실패";
          publishLog(exploreId, `오류: ${state.error}`);
        }
      }
    })();

    return reply.code(202).send({ exploreId });
  });

  app.get("/api/explore/:exploreId", async (req, reply) => {
    const { exploreId } = req.params as { exploreId: string };
    const state = explores.get(exploreId);
    if (!state) return reply.code(404).send({ error: "탐색 작업을 찾지 못했습니다." });
    return {
      exploreId: state.exploreId,
      url: state.url,
      status: state.status,
      mapId: state.mapId,
      error: state.error,
    };
  });

  app.post("/api/explore/:exploreId/cancel", async (req, reply) => {
    const { exploreId } = req.params as { exploreId: string };
    const state = explores.get(exploreId);
    if (!state) return reply.code(404).send({ error: "탐색 작업을 찾지 못했습니다." });
    if (state.status === "running") {
      state.controller.abort();
      state.status = "cancelled";
    }
    return { ok: true };
  });

  // ── 요소 맵 CRUD ──────────────────────────────────────────────────────────

  app.get("/api/element-maps", async () => {
    return { maps: listElementMaps() };
  });

  app.get("/api/element-maps/by-url", async (req, reply) => {
    const url = typeof (req.query as Record<string, unknown>).url === "string"
      ? (req.query as Record<string, string>).url.trim()
      : "";
    if (!url) return reply.code(400).send({ error: "url 파라미터가 필요합니다." });
    const found = findLatestMapByUrl(url);
    if (!found) return reply.code(404).send({ error: "해당 URL의 요소 맵이 없습니다." });
    return { mapId: found.mapId, map: found.map };
  });

  app.get("/api/element-maps/:mapId", async (req, reply) => {
    const { mapId } = req.params as { mapId: string };
    try {
      return loadElementMap(mapId);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "요소 맵 로드 실패" });
    }
  });

  app.delete("/api/element-maps/:mapId", async (req, reply) => {
    const { mapId } = req.params as { mapId: string };
    try {
      deleteElementMap(mapId);
      return { ok: true };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "요소 맵 삭제 실패" });
    }
  });

  // ── 매칭 (Phase 3) ───────────────────────────────────────────────────────

  app.post("/api/matches", async (req, reply) => {
    const body = isRecord(req.body) ? req.body : {};
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const mapId = typeof body.mapId === "string" ? body.mapId : "";
    if (!jobId || !mapId) return reply.code(400).send({ error: "jobId와 mapId가 필요합니다." });

    const job = getJob(jobId);
    if (!job || job.cases.length === 0) return reply.code(404).send({ error: "TC 케이스를 찾지 못했습니다." });

    let map;
    try {
      map = loadElementMap(mapId);
    } catch {
      return reply.code(404).send({ error: "요소 맵을 찾지 못했습니다." });
    }

    const matchJobId = randomUUID();
    const controller = new AbortController();
    const state: MatchJobState = { matchJobId, jobId, mapId, status: "running", controller };
    matchJobs.set(matchJobId, state);

    const textWorker = createOllamaWorker({ model: textModel() });

    void (async () => {
      try {
        const matchSet = await matchTcToMap({
          cases: job.cases,
          map,
          mapId,
          jobId,
          worker: textWorker,
          signal: controller.signal,
          onLog: (msg) => publishLog(matchJobId, msg),
        });
        const meta = saveMatchSet(matchSet);
        applyMatchToJob(matchSet);
        state.status = "completed";
        state.matchId = meta.matchId;
        publishLog(matchJobId, `매칭 완료 (matchId: ${meta.matchId})`);
      } catch (error) {
        if (controller.signal.aborted) {
          state.status = "cancelled";
        } else {
          state.status = "failed";
          state.error = error instanceof Error ? error.message : "매칭 실패";
          publishLog(matchJobId, `오류: ${state.error}`);
        }
      }
    })();

    return reply.code(202).send({ matchJobId });
  });

  app.get("/api/matches/jobs/:matchJobId", async (req, reply) => {
    const { matchJobId } = req.params as { matchJobId: string };
    const state = matchJobs.get(matchJobId);
    if (!state) return reply.code(404).send({ error: "매칭 작업을 찾지 못했습니다." });
    return { matchJobId: state.matchJobId, jobId: state.jobId, mapId: state.mapId, status: state.status, matchId: state.matchId, error: state.error };
  });

  app.get("/api/matches", async () => {
    return { matches: listMatchSets() };
  });

  app.get("/api/matches/:matchId", async (req, reply) => {
    const { matchId } = req.params as { matchId: string };
    try {
      return loadMatchSet(matchId);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "매칭 결과 로드 실패" });
    }
  });

  app.patch("/api/matches/:matchId/steps/:stepIndex", async (req, reply) => {
    const { matchId, stepIndex: stepIndexStr } = req.params as { matchId: string; stepIndex: string };
    const stepIndex = parseInt(stepIndexStr, 10);
    if (isNaN(stepIndex)) return reply.code(400).send({ error: "stepIndex 는 숫자여야 합니다." });
    const body = isRecord(req.body) ? req.body : {};
    const action = typeof body.action === "string" ? body.action : "";
    if (action !== "approve" && action !== "choose" && action !== "reject") {
      return reply.code(400).send({ error: "action 은 approve|choose|reject 중 하나여야 합니다." });
    }
    const chosenIndex = typeof body.chosenIndex === "number" ? body.chosenIndex : undefined;
    const note = typeof body.note === "string" ? body.note.trim() : undefined;
    let set: MatchSet;
    try {
      set = loadMatchSet(matchId);
    } catch {
      return reply.code(404).send({ error: "매칭 결과를 찾지 못했습니다." });
    }
    try {
      applyReview(set, stepIndex, action, chosenIndex, note);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "검토 적용 실패" });
    }
    saveMatchSetById(matchId, set);
    applyMatchToJob(set);
    return { ok: true };
  });

  app.post("/api/matches/:matchId/reset", async (req, reply) => {
    const { matchId } = req.params as { matchId: string };
    let set: MatchSet;
    try {
      set = loadMatchSet(matchId);
    } catch {
      return reply.code(404).send({ error: "매칭 결과를 찾지 못했습니다." });
    }
    resetMatchReview(set);
    saveMatchSetById(matchId, set);
    applyMatchToJob(set);
    return { ok: true };
  });

  app.delete("/api/matches/:matchId", async (req, reply) => {
    const { matchId } = req.params as { matchId: string };
    let set: MatchSet;
    try {
      set = loadMatchSet(matchId);
      deleteMatchSet(matchId);
    } catch {
      return reply.code(404).send({ error: "매칭 결과를 찾지 못했습니다." });
    }
    removeMatchFromJob(set);
    return { ok: true };
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
    const login = readLogin(body);
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

    // 승인된 매칭 결과가 있으면 요소 맵 로케이터를 inputs.selector 에 주입한다
    const mapFound = findLatestMapByUrl(startUrl);
    const approvedMatchSet = mapFound
      ? findLatestMatchSet(jobId, mapFound.mapId)?.set
      : undefined;

    const resolvedInputs = (inputsOverride ?? testCase.inputs).map((input) => {
      const typed = Object.prototype.hasOwnProperty.call(values, input.target)
        ? values[input.target] ?? ""
        : input.value;
      const withValue = { ...input, value: typed };
      if (withValue.selector) return withValue;
      if (!approvedMatchSet || isDateControl(input.control)) return withValue;
      const resolved = resolveApprovedLocator(approvedMatchSet, input.target);
      return resolved
        ? { ...withValue, selector: resolved.selector, selectorStrategy: resolved.selectorStrategy }
        : withValue;
    });

    const mergedCase: TestCase = {
      ...testCase,
      ...(apiPath !== undefined ? { apiPath } : {}),
      ...(assert !== undefined ? { assert } : {}),
      ...(optionContainerSelector !== undefined ? { optionContainerSelector } : {}),
      inputs: resolvedInputs,
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
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const login = readLogin(body);

    try {
      const selector = await inspectSelector({ startUrl, login });
      // 요소 맵에도 저장 (label이 있을 때)
      if (selector && label && label !== "__option_container__") {
        try {
          upsertPinnedSelector(startUrl, label, selector);
        } catch {
          // 요소 맵 저장 실패는 셀렉터 반환에 영향을 주지 않는다.
        }
      }
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
