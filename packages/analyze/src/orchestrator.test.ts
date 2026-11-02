import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planQuestions } from "./plan-questions.js";
import { reduceAnalyses } from "./reduce.js";
import { runAnalysisJob } from "./orchestrator.js";
import type { AnalysisCache } from "./analysis-cache.js";
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

  it("텍스트 기획서는 비전 워커를 쓰지 않는다", async () => {
    let visionAsks = 0;
    let textAsks = 0;
    const result = await runAnalysisJob({
      jobId: "job-3",
      specText: "화면 ID\n로그인\n[이메일 입력] 형식 오류 시 올바른 이메일 형식을 입력해주세요.",
      worker: {
        async ask() {
          textAsks += 1;
          return JSON.stringify({
            screenName: "로그인",
            inputs: [{ target: "이메일", constraint: "", warning: "", failureExample: "" }],
            successText: "",
            buttonName: "",
          });
        },
        async unload() {
          return undefined;
        },
      },
      visionWorker: {
        async ask() {
          visionAsks += 1;
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(textAsks, 1);
    assert.equal(visionAsks, 0);
  });

  it("Axure URL은 토큰 없이 읽고 텍스트 워커로만 분석한다", async () => {
    const documentJs = `var _creator = function() { return _(a,_(b,[_(c,d,e,f,g,h,i,j)]));};
var a="sitemap",b="rootNodes",c="id",d="p1",e="pageName",f="[PI-001]환자정보",g="type",h="Wireframe",i="url",j="_pi-001_x.html";
return _creator();`;
    const pageJs = `var _creator = function() { return _(a,_(b,[_(c,d,e,f,g,h)]));};
var a="page",b="annotations",c="fn",d="1",e="label",f="생년월일",g="Note",h="<p>생년월일 표시형식: YYYY-MM-DD</p>";
return _creator();`;
    const visionWorker: AnalysisWorker = {
      async ask() {
        throw new Error("비전 워커를 부르면 안 된다");
      },
      async unload() {
        return undefined;
      },
    };
    let asks = 0;
    const result = await runAnalysisJob({
      jobId: "job-axure",
      url: "https://abc.axshare.com/_pi-001_x.html",
      axureFetchImpl: async (url) => ({
        status: 200,
        text: async () => (url.endsWith("/data/document.js") ? documentJs : pageJs),
      }),
      worker: {
        async ask() {
          asks += 1;
          return JSON.stringify({
            screenName: "환자정보",
            inputs: [{ target: "생년월일", constraint: "", warning: "", failureExample: "" }],
            successText: "",
            buttonName: "",
          });
        },
        async unload() {
          return undefined;
        },
      },
      visionWorker,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(asks, 1);
    assert.equal(result.screens[0]?.screenKey, "axure-1");
  });

  it("기본값에서는 스크린샷을 받지 않고 텍스트 워커로만 분석한다", async () => {
    const previous = process.env.ANALYSIS_USE_VISION;
    delete process.env.ANALYSIS_USE_VISION;
    let imageRequests = 0;
    let textAsks = 0;
    try {
      const result = await runAnalysisJob({
        jobId: "job-novision",
        url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
        token: "token",
        fetchImpl: async (requestUrl) => {
          if (requestUrl.includes("/images/")) imageRequests += 1;
          return {
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
                    ],
                  },
                },
              },
            }),
          };
        },
        worker: {
          async ask() {
            textAsks += 1;
            return JSON.stringify({ screenName: "로그인", inputs: [], successText: "", buttonName: "" });
          },
          async unload() {
            return undefined;
          },
        },
        visionWorker: {
          async ask() {
            throw new Error("비전 워커를 부르면 안 된다");
          },
          async unload() {
            return undefined;
          },
        },
        signal: new AbortController().signal,
        onEvent: () => undefined,
      });
      assert.equal(imageRequests, 0);
      assert.ok(textAsks >= 1);
      assert.equal(result.status, JOB_STATUS.completed);
    } finally {
      if (previous === undefined) delete process.env.ANALYSIS_USE_VISION;
      else process.env.ANALYSIS_USE_VISION = previous;
    }
  });

  it("피그마 스크린샷이 있으면 비전 워커에 이미지를 넣는다", async () => {
    let sawImage = false;
    const png = new Uint8Array([1, 2, 3]).buffer;
    const result = await runAnalysisJob({
      jobId: "job-4",
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      useVision: true,
      fetchImpl: async (requestUrl) => {
        if (requestUrl.includes("/images/")) {
          return {
            status: 200,
            json: async () => ({ images: { "1:2": "https://img.example/shot.png" } }),
          };
        }
        if (requestUrl.includes("img.example")) {
          return {
            status: 200,
            json: async () => ({}),
            arrayBuffer: async () => png,
          };
        }
        return {
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
                  ],
                },
              },
            },
          }),
        };
      },
      worker: {
        async ask() {
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      visionWorker: {
        async ask(input) {
          sawImage = Boolean(input.images?.length);
          return JSON.stringify({
            screenName: "로그인",
            inputs: [{ target: "이메일", constraint: "", warning: "", failureExample: "" }],
            successText: "",
            buttonName: "로그인",
          });
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(sawImage, true);
  });

  it("비전 요청이 실패하면 텍스트 워커로 다시 묻는다", async () => {
    let textAsks = 0;
    const png = new Uint8Array([1, 2, 3]).buffer;
    const result = await runAnalysisJob({
      jobId: "job-5",
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      useVision: true,
      fetchImpl: async (requestUrl) => {
        if (requestUrl.includes("/images/")) {
          return {
            status: 200,
            json: async () => ({ images: { "1:2": "https://img.example/shot.png" } }),
          };
        }
        if (requestUrl.includes("img.example")) {
          return {
            status: 200,
            json: async () => ({}),
            arrayBuffer: async () => png,
          };
        }
        return {
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
                  ],
                },
              },
            },
          }),
        };
      },
      worker: {
        async ask() {
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      visionWorker: {
        async ask() {
          throw new Error("Ollama 요청에 실패했습니다. HTTP 400 · exceeds the available context size");
        },
        async unload() {
          return undefined;
        },
      },
      textWorker: {
        async ask() {
          textAsks += 1;
          return JSON.stringify({
            screenName: "로그인",
            inputs: [{ target: "이메일", constraint: "", warning: "", failureExample: "" }],
            successText: "",
            buttonName: "로그인",
          });
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(textAsks, 1);
    assert.equal(result.questions[0]?.status, QUESTION_STATUS.succeeded);
  });

  it("비전 응답 JSON이 깨지면 텍스트 워커로 재시도한다", async () => {
    let textAsks = 0;
    let visionUnloads = 0;
    const png = new Uint8Array([1, 2, 3]).buffer;
    const result = await runAnalysisJob({
      jobId: "job-5b",
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      useVision: true,
      fetchImpl: async (requestUrl) => {
        if (requestUrl.includes("/images/")) {
          return {
            status: 200,
            json: async () => ({ images: { "1:2": "https://img.example/shot.png" } }),
          };
        }
        if (requestUrl.includes("img.example")) {
          return {
            status: 200,
            json: async () => ({}),
            arrayBuffer: async () => png,
          };
        }
        return {
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
                  ],
                },
              },
            },
          }),
        };
      },
      worker: {
        async ask() {
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      visionWorker: {
        async ask() {
          // qwen2.5vl:7b가 JSON 대신 자연어로 응답하는 케이스를 재현
          return "not json at all";
        },
        async unload() {
          visionUnloads += 1;
        },
      },
      textWorker: {
        async ask() {
          textAsks += 1;
          return JSON.stringify({
            screenName: "로그인",
            inputs: [{ target: "이메일", constraint: "", warning: "", failureExample: "" }],
            successText: "",
            buttonName: "로그인",
          });
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    // 비전 JSON 오류 → 텍스트 재시도 → 성공
    assert.equal(textAsks, 1);
    assert.ok(visionUnloads >= 1);
    assert.equal(result.questions[0]?.status, QUESTION_STATUS.succeeded);
    assert.equal(result.status, "completed");
  });

  describe("모델 메모리 관리", () => {
    const png = new Uint8Array([1, 2, 3]).buffer;
    const answer = JSON.stringify({
      screenName: "로그인",
      inputs: [{ target: "이메일", constraint: "", warning: "", failureExample: "" }],
      successText: "",
      buttonName: "로그인",
    });

    /** 화면 2개(질문 2개 이상)와 스크린샷을 돌려주는 피그마 응답 */
    async function twoScreenFigma(requestUrl: string) {
      if (requestUrl.includes("/images/")) {
        return { status: 200, json: async () => ({ images: { "1:2": "https://img.example/shot.png" } }) };
      }
      if (requestUrl.includes("img.example")) {
        return { status: 200, json: async () => ({}), arrayBuffer: async () => png };
      }
      return {
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
      };
    }

    function recordingWorker(name: string, calls: string[], ask: () => Promise<string>): AnalysisWorker {
      return {
        async ask() {
          calls.push(`${name}.ask`);
          return ask();
        },
        async unload() {
          calls.push(`${name}.unload`);
        },
      };
    }

    it("질문이 여러 개여도 비전 모델은 질문마다 내리지 않고 끝에 한 번만 내린다", async () => {
      const calls: string[] = [];
      const vision = recordingWorker("vision", calls, async () => answer);
      const text = recordingWorker("text", calls, async () => answer);
      const result = await runAnalysisJob({
        jobId: "job-keep",
        url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
        token: "token",
        useVision: true,
        fetchImpl: twoScreenFigma,
        worker: text,
        textWorker: text,
        visionWorker: vision,
        signal: new AbortController().signal,
        onEvent: () => undefined,
      });
      assert.equal(result.status, JOB_STATUS.completed);
      const asks = calls.filter((call) => call === "vision.ask").length;
      assert.ok(asks >= 2, `질문이 2개 이상이어야 한다. 실제: ${asks}`);
      assert.deepEqual(calls, [...Array<string>(asks).fill("vision.ask"), "vision.unload"]);
    });

    it("텍스트로 재시도할 때만 비전 모델을 내려 두 모델이 함께 올라가지 않는다", async () => {
      const calls: string[] = [];
      let visionAsks = 0;
      const vision = recordingWorker("vision", calls, async () => {
        visionAsks += 1;
        if (visionAsks === 1) throw new Error("Ollama 요청에 실패했습니다. HTTP 500");
        return answer;
      });
      const text = recordingWorker("text", calls, async () => answer);
      await runAnalysisJob({
        jobId: "job-switch",
        url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
        token: "token",
        useVision: true,
        fetchImpl: twoScreenFigma,
        worker: text,
        textWorker: text,
        visionWorker: vision,
        signal: new AbortController().signal,
        onEvent: () => undefined,
      });
      // 첫 질문: 비전 실패 → 비전을 내리고 텍스트로 재시도. 다음 질문: 텍스트를 내리고 비전으로 돌아감. 끝: 비전을 내림.
      const rest = calls.slice(5, -1);
      assert.deepEqual(calls.slice(0, 5), ["vision.ask", "vision.unload", "text.ask", "text.unload", "vision.ask"]);
      assert.ok(rest.every((call) => call === "vision.ask"), `이후엔 비전만 묻는다. 실제: ${rest.join(", ")}`);
      assert.equal(calls.at(-1), "vision.unload");
    });
  });

  it("기획서에 없는 경고는 실패 항목으로 남기지 않는다", async () => {
    const result = await runAnalysisJob({
      jobId: "job-6",
      specText: "화면 ID\n[관리자] 사용자 현황\n이름, 성별로 조회한다.",
      worker: {
        async ask() {
          return JSON.stringify({
            screenName: "관리자 사용자 현황",
            inputs: [
              {
                target: "이름",
                constraint: "필수",
                warning: "이름을 입력해주세요.",
                failureExample: "이름",
              },
            ],
            successText: "",
            buttonName: "조회",
          });
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(result.screens[0]?.inputs[0]?.warning, "");
  });
});

describe("runAnalysisJob 캐시", () => {
  const specText = [
    "화면 ID",
    "[관리자] 로그인",
    "[이메일 입력] 형식 오류 시 올바른 이메일 형식을 입력해주세요.",
  ].join("\n");

  function countingWorker(): AnalysisWorker & { asks: number } {
    const state = {
      asks: 0,
      async ask(): Promise<string> {
        state.asks += 1;
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
      async unload(): Promise<void> {},
    };
    return state;
  }

  function memoryCache(): AnalysisCache {
    const store = new Map<string, string>();
    return {
      get: (key) => store.get(key) ?? null,
      set: (key, raw) => void store.set(key, raw),
    };
  }

  async function run(worker: AnalysisWorker, cache: AnalysisCache) {
    return runAnalysisJob({
      jobId: "job-cache",
      specText,
      worker,
      cache,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
  }

  it("같은 기획서를 다시 분석하면 모델을 부르지 않고 같은 결과를 낸다", async () => {
    const cache = memoryCache();
    const first = countingWorker();
    const firstResult = await run(first, cache);
    assert.equal(first.asks, 1);

    const second = countingWorker();
    const secondResult = await run(second, cache);
    assert.equal(second.asks, 0);
    assert.deepEqual(secondResult.screens, firstResult.screens);
    assert.equal(secondResult.status, JOB_STATUS.completed);
  });

  it("JSON 파싱에 실패한 응답은 캐시하지 않는다", async () => {
    const cache = memoryCache();
    const bad: AnalysisWorker & { asks: number } = {
      asks: 0,
      async ask() {
        bad.asks += 1;
        return "not-json";
      },
      async unload() {},
    };
    await run(bad, cache);
    await run(bad, cache);
    assert.equal(bad.asks, 2);
  });
});

describe("runAnalysisJob 표시 전용 질문", () => {
  it("조회·제공만 설명하는 질문은 모델을 부르지 않고 입력 없이 끝낸다", async () => {
    let asks = 0;
    const result = await runAnalysisJob({
      jobId: "job-display",
      specText: "화면 ID\n[관리자] 검사 결과\n[구성 영역] 체성분 분석 → 체수분, 단백질 정보 제공",
      worker: {
        async ask() {
          asks += 1;
          return "{}";
        },
        async unload() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    assert.equal(asks, 0);
    assert.equal(result.status, JOB_STATUS.completed);
    assert.equal(result.questions[0]?.status, "succeeded");
    assert.equal(result.screens[0]?.inputs.length, 0);
  });
});
