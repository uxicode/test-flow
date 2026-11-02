import { fetchAxureScreens, isAxureUrl, type TextFetchLike } from "@testflow/axure";
import {
  fetchSpecImage,
  fetchSpecLines,
  segmentScreens,
  type FetchLike,
  type ScreenSegment,
} from "@testflow/figma";
import { questionCacheKey, type AnalysisCache } from "./analysis-cache.js";
import { textModel, visionEnabled, visionMaxSide, visionModel } from "./models.js";
import { isDisplayOnlyQuestion, keepRealInputs } from "./keep-real-inputs.js";
import { keepSpecWarnings } from "./keep-spec-warnings.js";
import { parseModelJson } from "./parse-model-json.js";
import { planQuestions } from "./plan-questions.js";
import { buildQuestionPrompt } from "./prompt.js";
import { reduceAnalyses } from "./reduce.js";
import { attachFeatures, fillMissingSuccess } from "./success-text.js";
import {
  JOB_STATUS,
  QUESTION_STATUS,
  type AnalysisEvent,
  type AnalysisResult,
  type AnalysisWorker,
  type AskMetrics,
  type PlannedQuestion,
  type QuestionRecord,
  type QuestionStatus,
  type ScreenAnalysis,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;

function now(): string {
  return new Date().toISOString();
}

function linkAbort(parent: AbortSignal, child: AbortController): void {
  if (parent.aborted) {
    child.abort();
    return;
  }
  parent.addEventListener("abort", () => child.abort(), { once: true });
}

/**
 * 한 번에 한 모델만 메모리에 둔다.
 * 질문마다 내렸다 올리면 모델 파일(수 GB)을 매번 다시 읽으므로, 다른 모델로 바꿀 때만 앞 모델을 내린다.
 */
function createModelSlot() {
  let loaded: AnalysisWorker | null = null;
  return {
    async use(worker: AnalysisWorker): Promise<void> {
      if (loaded && loaded !== worker) await loaded.unload().catch(() => undefined);
      loaded = worker;
    },
    async release(): Promise<void> {
      if (loaded) await loaded.unload().catch(() => undefined);
      loaded = null;
    },
  };
}

/** 로그에 남길 질문 요약: 화면명 줄을 뺀 본문 앞부분과 전체 글자 수. */
function describeQuestion(question: PlannedQuestion): string {
  const body = question.text.startsWith(question.screenName)
    ? question.text.slice(question.screenName.length)
    : question.text;
  const flat = body.replace(/\s+/gu, " ").trim();
  const preview = flat.length > 50 ? `${flat.slice(0, 50)}…` : flat;
  return `${preview || "(본문 없음)"} (${question.text.length}자)`;
}

/** 모델 호출의 단계별 소요를 한 줄로 만든다. 예: ` · 로드 0.1초 · 입력 2,310토큰 3.2초 · 출력 480토큰 41.0초` */
function describeMetrics(metrics: AskMetrics | undefined): string {
  if (!metrics) return "";
  const sec = (ms: number): string => `${(ms / 1000).toFixed(1)}초`;
  return ` · 로드 ${sec(metrics.loadMs)} · 입력 ${metrics.promptTokens.toLocaleString("en-US")}토큰 ${sec(metrics.promptMs)} · 출력 ${metrics.outputTokens.toLocaleString("en-US")}토큰 ${sec(metrics.outputMs)}`;
}

function linesFromSpec(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function runAnalysisJob(options: {
  jobId: string;
  url?: string;
  token?: string;
  specText?: string;
  fetchImpl?: FetchLike;
  /** Axure Cloud 게시본을 읽는 fetch. 테스트에서 바꿔 끼운다. */
  axureFetchImpl?: TextFetchLike;
  worker: AnalysisWorker;
  textWorker?: AnalysisWorker;
  visionWorker?: AnalysisWorker;
  textModel?: string;
  visionModel?: string;
  /** 화면 이미지를 비전 모델에 넣을지. 없으면 환경 변수 ANALYSIS_USE_VISION(기본 끔)을 따른다. */
  useVision?: boolean;
  /** 질문별 모델 응답 캐시. 같은 질문은 모델을 다시 부르지 않는다. */
  cache?: AnalysisCache;
  timeoutMs?: number;
  signal: AbortSignal;
  onEvent: (event: AnalysisEvent) => void;
}): Promise<AnalysisResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const questions: QuestionRecord[] = [];
  const answers: ScreenAnalysis[] = [];
  let planned: PlannedQuestion[] = [];

  function emit(message: string, status?: AnalysisResult["status"], result?: AnalysisResult): void {
    options.onEvent({
      jobId: options.jobId,
      message,
      at: now(),
      ...(status ? { status } : {}),
      ...(result ? { result } : {}),
    });
  }

  function finish(status: AnalysisResult["status"], message: string): AnalysisResult {
    const result: AnalysisResult = {
      status,
      screens: attachFeatures(fillMissingSuccess(reduceAnalyses(answers), planned), planned),
      questions,
    };
    emit(message, status, result);
    return result;
  }

  const modelSlot = createModelSlot();
  try {
    if (options.signal.aborted) return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    const specText = options.specText?.trim() ?? "";
    const figmaUrl = options.url?.trim() ?? "";
    const figmaToken = options.token?.trim() ?? "";
    let lines: string[] = [];
    let image: string | null = null;
    let axureSegments: ScreenSegment[] | null = null;

    if (figmaUrl && isAxureUrl(figmaUrl)) {
      emit("Axure 기획서를 읽는 중", JOB_STATUS.fetching);
      axureSegments = await fetchAxureScreens({
        baseUrl: figmaUrl,
        ...(options.axureFetchImpl ? { fetchImpl: options.axureFetchImpl } : {}),
      });
      lines = axureSegments.flatMap((screen) => [screen.screenName, ...screen.body.split("\n")]);
    } else if (specText && !figmaUrl) {
      emit("텍스트 기획서를 읽는 중", JOB_STATUS.fetching);
      lines = linesFromSpec(specText);
    } else if (figmaUrl && figmaToken) {
      emit("피그마 화면과 텍스트를 읽는 중", JOB_STATUS.fetching);
      const fetchOpts = {
        url: figmaUrl,
        token: figmaToken,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      };
      lines = await fetchSpecLines(fetchOpts);
      image = (options.useVision ?? visionEnabled())
        ? await fetchSpecImage({ ...fetchOpts, maxSide: visionMaxSide() }).catch(() => null)
        : null;
    } else {
      return finish(JOB_STATUS.failed, "Figma URL·토큰, Axure URL 또는 텍스트 기획서가 필요합니다.");
    }
    if (options.signal.aborted) {
      await options.worker.unload();
      return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    }

    emit("질문을 나누는 중", JOB_STATUS.planning);
    let segments = axureSegments ?? segmentScreens(lines);
    if (segments.length === 0 && specText)
      segments = [{ screenKey: "screen-1", screenName: "기획서", body: specText }];
    planned = planQuestions(segments);
    if (planned.length === 0) {
      return finish(JOB_STATUS.failed, "설명 텍스트에서 화면을 찾지 못했습니다.");
    }
    const useVision = Boolean(image);
    const textName = options.textModel ?? textModel();
    const visionName = options.visionModel ?? visionModel();
    emit(
      useVision
        ? `${visionName}로 화면을 보고 설명을 맞추는 중`
        : `${textName}로 텍스트를 분석하는 중`,
    );
    for (const question of planned) {
      questions.push({
        id: question.id,
        screenKey: question.screenKey,
        screenName: question.screenName,
        status: QUESTION_STATUS.pending,
        message: "",
      });
    }
    emit(`질문 ${planned.length}개로 나눔`, JOB_STATUS.running);
    const specSource = [specText, ...lines].filter(Boolean).join("\n");
    const visionWorker = options.visionWorker ?? options.worker;
    const textWorker = options.textWorker ?? options.worker;

    for (let index = 0; index < planned.length; index += 1) {
      const question = planned[index];
      const record = questions[index];
      if (!question || !record) continue;
      if (options.signal.aborted) {
        record.status = QUESTION_STATUS.cancelled;
        record.message = "사용자가 중지했습니다.";
        continue;
      }
      record.status = QUESTION_STATUS.running;
      const startedAt = Date.now();
      emit(`질문 ${index + 1}/${planned.length} 시작 · ${question.screenName} · ${describeQuestion(question)}`);
      if (isDisplayOnlyQuestion(question.text)) {
        // 조회·표시만 설명하는 질문은 입력이 없다. 모델을 부르면 표 행마다 입력을 지어내며 오래 걸리므로 건너뛴다.
        answers.push({
          screenKey: question.screenKey,
          screenName: question.screenName,
          inputs: [],
          successText: "",
          buttonName: "",
        });
        record.status = QUESTION_STATUS.succeeded;
        record.message = "표시 전용, 모델 호출 생략";
        emit(`질문 ${index + 1}/${planned.length} 표시 전용 질문, 모델 호출 생략 · ${((Date.now() - startedAt) / 1000).toFixed(1)}초`);
        continue;
      }
      const images = image ? [image] : [];
      const hadVision = images.length > 0;
      const worker = hadVision ? visionWorker : textWorker;
      const visionPrompt = buildQuestionPrompt(question.text, { vision: hadVision });
      let outcome = await askOne({
        text: visionPrompt,
        spec: specSource,
        images,
        worker,
        prepare: () => modelSlot.use(worker),
        ...(options.cache
          ? {
              cache: options.cache,
              cacheKey: questionCacheKey({
                prompt: visionPrompt,
                model: hadVision ? visionName : textName,
                image: image && hadVision ? image : null,
              }),
            }
          : {}),
        question: question.text,
        timeoutMs,
        parent: options.signal,
      });
      const canRetryWithText =
        hadVision &&
        outcome.status === QUESTION_STATUS.failed &&
        !options.signal.aborted;
      if (canRetryWithText) {
        const rawSnippet = outcome.rawResponse
          ? ` · 비전 원시응답: ${outcome.rawResponse.slice(0, 120).replace(/\n/g, " ")}…`
          : "";
        emit(
          `질문 ${index + 1}/${planned.length} 비전 실패, 텍스트로 재시도 · ${outcome.message}${rawSnippet}`,
        );
        const textPrompt = buildQuestionPrompt(question.text);
        outcome = await askOne({
          text: textPrompt,
          spec: specSource,
          images: [],
          worker: textWorker,
          prepare: () => modelSlot.use(textWorker),
          ...(options.cache
            ? {
                cache: options.cache,
                cacheKey: questionCacheKey({ prompt: textPrompt, model: textName }),
              }
            : {}),
          question: question.text,
          timeoutMs,
          parent: options.signal,
        });
      }
      record.status = outcome.status;
      record.message = outcome.message;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const cacheNote = options.cache ? (outcome.cached ? " · 캐시 적중" : " · 캐시 없음") : "";
      emit(`질문 ${index + 1}/${planned.length} ${outcome.log} · ${seconds}초${cacheNote}${describeMetrics(outcome.metrics)}`);
      if (outcome.analysis) {
        answers.push({
          ...outcome.analysis,
          screenKey: question.screenKey,
          screenName: outcome.analysis.screenName || question.screenName,
        });
      }
      if (options.signal.aborted) {
        for (const pending of questions) {
          if (pending.status === QUESTION_STATUS.pending) {
            pending.status = QUESTION_STATUS.cancelled;
            pending.message = "사용자가 중지했습니다.";
          }
        }
        break;
      }
    }

    if (options.signal.aborted) {
      emit("취합 중", JOB_STATUS.reducing);
      return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    }
    emit("취합 중", JOB_STATUS.reducing);
    const screens = reduceAnalyses(answers);
    if (screens.length === 0) return finish(JOB_STATUS.failed, "취합할 분석 결과가 없습니다.");
    return finish(JOB_STATUS.completed, `취합 ${screens.length}화면`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석에 실패했습니다.";
    if (options.signal.aborted) {
      await options.worker.unload().catch(() => undefined);
      return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    }
    return finish(JOB_STATUS.failed, message);
  } finally {
    // 완료·실패·중지 어느 경우든 분석이 끝나면 올려 둔 모델을 내린다.
    await modelSlot.release();
  }
}

async function askOne(options: {
  text: string;
  spec: string;
  images?: string[];
  worker: AnalysisWorker;
  /** 모델을 실제로 부르기 직전에만 실행한다. 캐시에 있으면 호출되지 않는다. */
  prepare?: () => Promise<void>;
  cache?: AnalysisCache;
  cacheKey?: string;
  /** 이 질문의 원문. 모델이 지어낸 입력을 걸러내는 기준이 된다. */
  question: string;
  timeoutMs: number;
  parent: AbortSignal;
}): Promise<{
  status: QuestionStatus;
  message: string;
  log: string;
  analysis?: ScreenAnalysis;
  unload: boolean;
  /** 모델이 알려 준 단계별 소요. 캐시 응답이면 없다. */
  metrics?: AskMetrics;
  /** 모델을 부르지 않고 캐시 응답을 썼는지 */
  cached: boolean;
  /** 모델이 반환한 원시 문자열 (JSON 파싱 실패 디버깅용) */
  rawResponse?: string;
}> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  linkAbort(options.parent, controller);
  let raw = "";
  let metrics: AskMetrics | undefined;
  const cachedRaw =
    options.cache && options.cacheKey ? options.cache.get(options.cacheKey) : null;
  try {
    if (cachedRaw !== null) {
      raw = cachedRaw;
    } else {
      await options.prepare?.();
      raw = await options.worker.ask({
        text: options.text,
        ...(options.images?.length ? { images: options.images } : {}),
        signal: controller.signal,
        onMetrics: (value) => {
          metrics = value;
        },
      });
    }
    clearTimeout(timer);
    if (options.parent.aborted) {
      return {
        status: QUESTION_STATUS.cancelled,
        message: "사용자가 중지했습니다.",
        log: "사용자가 중지했습니다.",
        unload: true,
        cached: cachedRaw !== null,
      };
    }
    const analysis = keepRealInputs(
      keepSpecWarnings(parseModelJson(raw, "", ""), options.spec),
      options.question,
    );
    if (cachedRaw === null && options.cache && options.cacheKey) {
      options.cache.set(options.cacheKey, raw);
    }
    return {
      status: QUESTION_STATUS.succeeded,
      message: "완료",
      log: cachedRaw !== null ? "질문 완료 (캐시)" : "질문 완료",
      analysis,
      unload: false,
      cached: cachedRaw !== null,
      ...(metrics ? { metrics } : {}),
    };
  } catch (error) {
    clearTimeout(timer);
    if (timedOut) {
      return {
        status: QUESTION_STATUS.timedOut,
        message: "시간 초과",
        log: "질문 시간 초과, 모델 종료",
        unload: true,
        cached: cachedRaw !== null,
      };
    }
    if (options.parent.aborted || controller.signal.aborted) {
      return {
        status: QUESTION_STATUS.cancelled,
        message: "사용자가 중지했습니다.",
        log: "사용자가 중지했습니다.",
        unload: true,
        cached: cachedRaw !== null,
      };
    }
    const message = error instanceof Error ? error.message : "질문 실패";
    return {
      status: QUESTION_STATUS.failed,
      message,
      log: message,
      unload: false,
      cached: cachedRaw !== null,
      rawResponse: raw || undefined,
    };
  }
}
