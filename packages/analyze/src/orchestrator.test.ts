import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planQuestions } from "./plan-questions.js";
import { reduceAnalyses } from "./reduce.js";
import { runAnalysisJob } from "./orchestrator.js";
import { JOB_STATUS, QUESTION_STATUS, type AnalysisWorker } from "./types.js";

describe("planQuestions", () => {
  it("기능 행이 여러 개고 본문이 길면 질문을 나눈다", () => {
    const body = [
      "[이메일 입력] 형식이 올바르지 않을 경우 올바른 이메일 형식을 입력해주세요 라고 보여야 한다. ".repeat(8),
      "[비밀번호 입력] 정책에 맞지 않을 경우 비밀번호 규칙을 확인해주세요.",
      "[로그인] 로그인 성공 시 대시보드로 이동",
    ].join("\n");
    const questions = planQuestions([
      { screenKey: "screen-1", screenName: "관리자 로그인", body },
    ]);
    assert.equal(questions.length, 3);
    assert.ok(questions.every((question) => question.screenKey === "screen-1"));
  });
});

describe("reduceAnalyses", () => {
  it("같은 화면의 입력 항목을 합친다", () => {
    const screens = reduceAnalyses([
      {
        screenKey: "screen-1",
        screenName: "관리자 로그인",
        inputs: [{ target: "이메일", constraint: "형식", warning: "형식 오류", failureExample: "bad" }],
        successText: "",
        buttonName: "",
      },
      {
        screenKey: "screen-1",
        screenName: "관리자 로그인",
        inputs: [{ target: "비밀번호", constraint: "길이", warning: "규칙 오류", failureExample: "a" }],
        successText: "대시보드",
        buttonName: "로그인",
      },
    ]);
    assert.equal(screens.length, 1);
    assert.equal(screens[0]?.inputs.length, 2);
    assert.equal(screens[0]?.successText, "대시보드");
    assert.equal(screens[0]?.buttonName, "로그인");
  });
});

describe("runAnalysisJob", () => {
  const lines = ["화면 ID", "[관리자] 로그인", "[이메일 입력] 형식 오류 시 올바른 이메일 형식을 입력해주세요."];

  function worker(behavior: "ok" | "slow" | "bad"): AnalysisWorker & { unloads: number } {
    const state = { unloads: 0 };
    return {
      unloads: 0,
      async ask(input) {
        if (behavior === "slow") {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50);
            input.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            });
          });
        }
        if (behavior === "bad") return "not-json";
        return JSON.stringify({
          screenName: "관리자 로그인",
          inputs: [
            {
              target: "이메일",
              constraint: "이메일 형식",
              warning: "올바른 이메일 형식을 입력해주세요.",
              failureExample: "not-an-email",
            },
          ],
          successText: "대시보드",
          buttonName: "로그인",
        });
      },
      async unload() {
        state.unloads += 1;
      },
      get unloadsCount() {
        return state.unloads;
      },
    };
  }

  it("질문 시간 초과 시 모델을 내리고 그 질문만 실패로 남긴다", async () => {
    const used = worker("slow");
    const result = await runAnalysisJob({
      jobId: "job-1",
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({
          nodes: {
            "1:2": {
              document: {
                id: "1:2",
                name: "기획",
                type: "FRAME",
                children: lines.map((line, index) => ({
                  id: `t${index}`,
                  name: line,
                  type: "TEXT",
                  characters: line,
                })),
              },
            },
          },
        }),
      }),
      worker: used,
      timeoutMs: 10,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.questions[0]?.status, QUESTION_STATUS.timedOut);
    assert.equal(result.status, JOB_STATUS.failed);
    assert.ok(used.unloadsCount >= 1);
  });

  it("중지를 누르면 대기 질문을 실행하지 않는다", async () => {
    const controller = new AbortController();
    let asks = 0;
    const result = await runAnalysisJob({
      jobId: "job-2",
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({
          nodes: {
            "1:2": {
              document: {
                id: "1:2",
                name: "기획",
                type: "FRAME",
                children: [
                  { id: "a", name: "화면 ID", type: "TEXT", characters: "화면 ID" },
                  { id: "b", name: "로그인", type: "TEXT", characters: "[관리자] 로그인" },
                  { id: "c", name: "본문", type: "TEXT", characters: "[이메일 입력] 형식 오류" },
                  { id: "d", name: "화면 ID", type: "TEXT", characters: "화면 ID" },
                  { id: "e", name: "홈", type: "TEXT", characters: "홈" },
                  { id: "f", name: "본문2", type: "TEXT", characters: "[메뉴] 홈으로 이동하면 메인 화면이 열린다" },
                ],
              },
            },
          },
        }),
      }),
      worker: {
        async ask(input) {
          asks += 1;
          controller.abort();
          input.signal.throwIfAborted();
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      signal: controller.signal,
      onEvent: () => undefined,
    });
    assert.equal(asks, 1);
    assert.equal(result.status, JOB_STATUS.cancelled);
    assert.ok(result.questions.some((question) => question.status === QUESTION_STATUS.cancelled));
  });
});
