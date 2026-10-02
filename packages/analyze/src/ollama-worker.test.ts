import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOllamaWorker, ollamaErrorText } from "./ollama-worker.js";

describe("ollamaErrorText", () => {
  it("중첩된 context 초과 메시지를 꺼낸다", () => {
    const raw = JSON.stringify({
      error: JSON.stringify({
        error: {
          code: 400,
          message: "request (4118 tokens) exceeds the available context size (4096 tokens), try increasing it",
          type: "exceed_context_size_error",
        },
      }),
    });
    assert.match(ollamaErrorText(raw), /exceeds the available context size/);
  });
});

describe("createOllamaWorker", () => {
  it("실패 본문을 에러에 붙이고 비전은 num_ctx를 넣는다", async () => {
    const previousKeepAlive = process.env.OLLAMA_KEEP_ALIVE;
    delete process.env.OLLAMA_KEEP_ALIVE;
    let body: Record<string, unknown> = {};
    const worker = createOllamaWorker({
      model: "qwen2.5vl:7b",
      numCtx: 8192,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: JSON.stringify({
                error: { message: "request (4118 tokens) exceeds the available context size (4096 tokens)" },
              }),
            }),
          json: async () => ({}),
        } as Response;
      },
    });
    await assert.rejects(
      () =>
        worker.ask({
          text: "hi",
          images: ["aaaa"],
          signal: new AbortController().signal,
        }),
      /HTTP 400 · request \(4118 tokens\) exceeds/,
    );
    assert.deepEqual(body.options, { num_ctx: 8192 });
    assert.equal(body.keep_alive, 0);
    if (previousKeepAlive === undefined) delete process.env.OLLAMA_KEEP_ALIVE;
    else process.env.OLLAMA_KEEP_ALIVE = previousKeepAlive;
  });
});
