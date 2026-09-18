import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestOllamaVision } from "./ollama-vision.js";

describe("requestOllamaVision", () => {
  it("Ollama /api/chat 응답을 VisionFlowResult로 파싱한다", async () => {
    const { result, model } = await requestOllamaVision({
      imageBase64: "abc",
      ollamaModel: "qwen2.5vl:7b",
      fetchImpl: async (url, init) => {
        assert.match(url, /\/api\/chat$/);
        assert.equal(init?.method, "POST");
        const body = JSON.parse(init?.body ?? "{}") as {
          model: string;
          messages: { images: string[] }[];
        };
        assert.equal(body.model, "qwen2.5vl:7b");
        assert.deepEqual(body.messages[0]?.images, ["abc"]);
        return {
          status: 200,
          json: async () => ({
            message: {
              content: JSON.stringify({
                screens: [{ id: "s1", name: "로그인", text: "로그인" }],
                connections: [],
              }),
            },
          }),
        };
      },
    });
    assert.equal(model, "qwen2.5vl:7b");
    assert.equal(result.screens[0]?.name, "로그인");
  });
});
