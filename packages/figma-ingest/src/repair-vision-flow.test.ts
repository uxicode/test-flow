import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVisionFlowResult } from "./ollama-vision.js";
import { repairVisionFlowResult } from "./repair-vision-flow.js";
import { visionResultToDump } from "./vision-to-dump.js";

describe("repairVisionFlowResult", () => {
  it("없는 연결 대상 id를 노드로 만들어 워크플로우를 복구한다", () => {
    const repaired = repairVisionFlowResult({
      screens: [{ id: "s1", name: "로그인 프로세스", text: "1. 진입\n2. 입력" }],
      connections: [
        { from: "s1", to: "s2", label: "로그인 화면 진입" },
        { from: "s2", to: "s3", label: "이메일 입력" },
        { from: "s2", to: "s4", label: "존재하지 않음" },
      ],
    });
    assert.equal(repaired.screens.length, 4);
    assert.equal(
      repaired.screens.find((screen) => screen.id === "s2")?.name,
      "로그인 화면 진입",
    );
    assert.equal(repaired.connections.length, 3);
    assert.equal(repaired.screens[0]?.text, undefined);
  });

  it("번호 목록만 있으면 순차 연결로 펼친다", () => {
    const repaired = repairVisionFlowResult({
      screens: [
        {
          id: "s1",
          name: "프로세스맵",
          text: "1. 로그인 화면 진입\n2. 이메일 입력\n3. 로그인 버튼 클릭",
        },
      ],
      connections: [],
    });
    assert.equal(repaired.screens.length, 4);
    assert.equal(repaired.connections.length, 3);
    assert.equal(repaired.screens[1]?.name, "로그인 화면 진입");
  });
});

describe("parseVisionFlowResult 워크플로우 복구", () => {
  it("한 화면에 몰아넣은 프로세스맵을 여러 노드로 복구한다", () => {
    const result = parseVisionFlowResult(
      JSON.stringify({
        screens: [
          {
            id: "s1",
            name: "로그인/관리자 신청하기 프로세스 맵",
            text: "1. 로그인 화면 진입\n2. 이메일 입력",
          },
        ],
        connections: [
          { from: "s1", to: "s2", label: "로그인 화면 진입" },
          { from: "s2", to: "s3", label: "이메일 입력" },
        ],
      }),
    );
    const dump = visionResultToDump({
      fileKey: "file",
      startNodeId: "1:1",
      fallbackName: "캡처",
      result,
    });
    assert.ok(dump.nodes.length >= 3);
    assert.ok(dump.connections.length >= 2);
    assert.ok(dump.nodes.some((node) => node.name === "이메일 입력"));
  });
});
