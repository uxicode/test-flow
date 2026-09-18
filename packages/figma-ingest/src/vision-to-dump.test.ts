import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INGEST_ERROR, IngestError } from "./error-codes.js";
import { DUMP_ANALYSIS_METHOD } from "./types.js";
import { parseVisionFlowResult } from "./ollama-vision.js";
import { safeParseJson } from "./safe-parse-json.js";
import { visionResultToDump } from "./vision-to-dump.js";

describe("safeParseJson", () => {
  it("코드블록을 제거하고 객체를 파싱한다", () => {
    const parsed = safeParseJson('```json\n{"screens":[]}\n```');
    assert.deepEqual(parsed, { screens: [] });
  });
});

describe("parseVisionFlowResult", () => {
  it("screens와 connections를 읽는다", () => {
    const result = parseVisionFlowResult(
      JSON.stringify({
        screens: [
          { id: "s1", name: "로그인", text: "이메일\n로그인" },
          { id: "s2", name: "홈", text: "홈" },
        ],
        connections: [{ from: "s1", to: "s2", label: "로그인" }],
      }),
    );
    assert.equal(result.screens.length, 2);
    assert.equal(result.connections[0]?.label, "로그인");
  });

  it("화면이 없으면 vision_empty", () => {
    assert.throws(
      () => parseVisionFlowResult("{}"),
      (error: unknown) =>
        error instanceof IngestError && error.code === INGEST_ERROR.visionEmpty,
    );
  });
});

describe("visionResultToDump", () => {
  it("첫 화면 id를 startNodeId로 맞춘다", () => {
    const dump = visionResultToDump({
      fileKey: "fileKey1",
      startNodeId: "9:9",
      fallbackName: "캡처",
      model: "qwen2.5vl:7b",
      result: {
        screens: [
          { id: "s1", name: "로그인", text: "이메일" },
          { id: "s2", name: "홈", text: "홈" },
        ],
        connections: [{ from: "s1", to: "s2", label: "성공" }],
      },
    });
    assert.equal(dump.startNodeId, "9:9");
    assert.equal(dump.nodes[0]?.id, "9:9");
    assert.equal(dump.analysis?.method, DUMP_ANALYSIS_METHOD.vision);
    assert.ok(dump.connections.some((edge) => edge.from === "9:9" && edge.to === "s2"));
  });
});
