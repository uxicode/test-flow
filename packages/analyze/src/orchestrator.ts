import { fetchSpecImage, fetchSpecLines, segmentScreens, type FetchLike } from "@testflow/figma";
import { textModel, visionMaxSide, visionModel } from "./models.js";
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

async function unloadQuestionWorkers(options: {
  hadVision: boolean;
  visionWorker: AnalysisWorker;
  textWorker: AnalysisWorker;
}): Promise<void> {
  if (options.hadVision) await options.visionWorker.unload().catch(() => undefined);
  if (options.textWorker !== options.visionWorker) {
    await options.textWorker.unload().catch(() => undefined);
  } else if (!options.hadVision) {
    await options.textWorker.unload().catch(() => undefined);
  }
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
  worker: AnalysisWorker;
  textWorker?: AnalysisWorker;
  visionWorker?: AnalysisWorker;
  textModel?: string;
  visionModel?: string;
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

  try {
    if (options.signal.aborted) return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    const specText = options.specText?.trim() ?? "";
    const figmaUrl = options.url?.trim() ?? "";
    const figmaToken = options.token?.trim() ?? "";
    let lines: string[] = [];
    let image: string | null = null;

    if (specText && !figmaUrl) {
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
      image = await fetchSpecImage({ ...fetchOpts, maxSide: visionMaxSide() }).catch(() => null);
    } else {
      return finish(JOB_STATUS.failed, "Figma URL·토큰 또는 텍스트 기획서가 필요합니다.");
    }
    if (options.signal.aborted) {
      await options.worker.unload();
      return finish(JOB_STATUS.cancelled, "사용자가 중지했습니다.");
    }

    emit("질문을 나누는 중", JOB_STATUS.planning);
    let segments = segmentScreens(lines);
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
      emit(`질문 ${index + 1}/${planned.length} 시작 · ${question.screenName}`);
      const images = image ? [image] : [];
      const hadVision = images.length > 0;
      const worker = hadVision ? visionWorker : textWorker;
      let outcome = await askOne({
        text: buildQuestionPrompt(question.text, { vision: hadVision }),
        spec: specSource,
        images,
        worker,
        timeoutMs,
        parent: options.signal,
      });
      if (hadVision) await visionWorker.unload().catch(() => undefined);
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
        outcome = await askOne({
          text: buildQuestionPrompt(question.text),
          spec: specSource,
          images: [],
          worker: textWorker,
          timeoutMs,
          parent: options.signal,
        });
      }
      record.status = outcome.status;
      record.message = outcome.message;
      emit(`질문 ${index + 1}/${planned.length} ${outcome.log}`);
      if (outcome.analysis) {
        answers.push({
          ...outcome.analysis,
          screenKey: question.screenKey,
          screenName: outcome.analysis.screenName || question.screenName,
        });
      }
      await unloadQuestionWorkers({ hadVision, visionWorker, textWorker });
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
  }
}

async function askOne(options: {
  text: string;
  spec: string;
  images?: string[];
  worker: AnalysisWorker;
  timeoutMs: number;
  parent: AbortSignal;
}): Promise<{
  status: QuestionStatus;
  message: string;
  log: string;
  analysis?: ScreenAnalysis;
  unload: boolean;
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
  try {
    raw = await options.worker.ask({
      text: options.text,
      ...(options.images?.length ? { images: options.images } : {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (options.parent.aborted) {
      return {
        status: QUESTION_STATUS.cancelled,
        message: "사용자가 중지했습니다.",
        log: "사용자가 중지했습니다.",
        unload: true,
      };
    }
    const analysis = keepSpecWarnings(parseModelJson(raw, "", ""), options.spec);
    return {
      status: QUESTION_STATUS.succeeded,
      message: "완료",
      log: "질문 완료",
      analysis,
      unload: false,
    };
  } catch (error) {
    clearTimeout(timer);
    if (timedOut) {
      return {
        status: QUESTION_STATUS.timedOut,
        message: "시간 초과",
        log: "질문 시간 초과, 모델 종료",
        unload: true,
      };
    }
    if (options.parent.aborted || controller.signal.aborted) {
      return {
        status: QUESTION_STATUS.cancelled,
        message: "사용자가 중지했습니다.",
        log: "사용자가 중지했습니다.",
        unload: true,
      };
    }
    const message = error instanceof Error ? error.message : "질문 실패";
    return {
      status: QUESTION_STATUS.failed,
      message,
      log: message,
      unload: false,
      rawResponse: raw || undefined,
    };
  }
}
