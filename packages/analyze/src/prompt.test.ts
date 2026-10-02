import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionPrompt } from "./prompt.js";

describe("buildQuestionPrompt", () => {
  it("텍스트 기획서 모드에서 구조화된 프롬프트를 생성한다", () => {
    const prompt = buildQuestionPrompt("회원가입 화면 기획서 내용");

    assert.ok(prompt.includes("# [분석 대상 및 기본 지침]"));
    assert.ok(prompt.includes("# [출력 JSON 스키마]"));
    assert.ok(prompt.includes("# [1. 화면 정보 및 액션 규칙]"));
    assert.ok(prompt.includes("# [2. 입력 필드(inputs) 추출 규칙]"));
    assert.ok(prompt.includes("# [3. 컨트롤 타입(control) 및 선택지(options) 판별 기준]"));
    assert.ok(prompt.includes("# [4. 유효성 검증(warning, failureExample) 규칙]"));
    assert.ok(prompt.includes("# [기획서 본문]"));
    assert.ok(prompt.includes("회원가입 화면 기획서 내용"));
    assert.ok(!prompt.includes("피그마"));
  });

  it("비전 옵션이 활성화된 경우 피그마 관련 지침이 포함된다", () => {
    const prompt = buildQuestionPrompt("사용자 현황 화면", { vision: true });

    assert.ok(prompt.includes("피그마 기획서 한 화면"));
    assert.ok(prompt.includes("와이어프레임/UI"));
    assert.ok(prompt.includes("사용자 현황 화면"));
    assert.ok(prompt.includes('{"screenName":"","inputs":[{"target":"","control":"text"'));
  });
});
