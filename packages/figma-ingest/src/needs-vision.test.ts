import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FigmaApiNode } from "./figma-api-types.js";
import { needsVisionAnalysis } from "./needs-vision.js";
import type { FigmaDump } from "./types.js";

const imageDump: FigmaDump = {
  fileKey: "file",
  startNodeId: "1:1",
  nodes: [{ id: "1:1", name: "캡처", type: "IMAGE" }],
  connections: [],
};

describe("needsVisionAnalysis", () => {
  it("텍스트와 연결이 없는 이미지면 true", () => {
    const roots: FigmaApiNode[] = [
      { id: "1:1", name: "캡처", type: "IMAGE" },
    ];
    assert.equal(needsVisionAnalysis(imageDump, roots), true);
  });

  it("프로토타입 연결이 있으면 false", () => {
    assert.equal(
      needsVisionAnalysis(
        {
          ...imageDump,
          nodes: [
            { id: "1:1", name: "로그인", type: "FRAME" },
            { id: "1:2", name: "홈", type: "FRAME" },
          ],
          connections: [{ from: "1:1", to: "1:2" }],
        },
        [{ id: "1:1", name: "로그인", type: "FRAME" }],
      ),
      false,
    );
  });

  it("TEXT characters가 있으면 false", () => {
    const roots: FigmaApiNode[] = [
      {
        id: "1:1",
        name: "로그인",
        type: "FRAME",
        children: [
          { id: "1:10", name: "버튼", type: "TEXT", characters: "로그인" },
        ],
      },
    ];
    assert.equal(needsVisionAnalysis(imageDump, roots), false);
  });
});
