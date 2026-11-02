import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDisplayOnlyQuestion, keepRealInputs } from "./keep-real-inputs.js";
import type { ScreenAnalysis } from "./types.js";

function analysis(inputs: ScreenAnalysis["inputs"]): ScreenAnalysis {
  return { screenKey: "s", screenName: "관리자 검사 결과", inputs, successText: "", buttonName: "" };
}

const base = { constraint: "", warning: "", failureExample: "" };

describe("keepRealInputs", () => {
  it("조회·제공만 설명하는 질문의 입력은 모두 버린다", () => {
    const text = "관리자 검사 결과\n[구성 영역] • 체성분 분석 → 체수분, 단백질, 무기질 정보 제공";
    assert.equal(isDisplayOnlyQuestion(text), true);
    const kept = keepRealInputs(analysis([{ target: "체수분", control: "text", ...base }]), text);
    assert.equal(kept.inputs.length, 0);
  });

  it("입력 행위가 함께 설명된 질문은 입력을 유지한다", () => {
    const text = "관리자 검사 결과\n[검사일 선택] 날짜를 선택하면 결과를 조회한다";
    assert.equal(isDisplayOnlyQuestion(text), false);
    const kept = keepRealInputs(analysis([{ target: "검사일", control: "date", ...base }]), text);
    assert.equal(kept.inputs.length, 1);
  });

  it("기획서에 없는 날짜 선택지를 만든 select는 날짜 입력으로 바로잡는다", () => {
    const text = "검사 결과\n[검사일 선택] 검사일을 선택한다";
    const kept = keepRealInputs(
      analysis([
        { target: "검사일 선택", control: "select", options: ["2023-01-01", "2023-02-01"], ...base },
      ]),
      text,
    );
    assert.equal(kept.inputs[0]?.control, "date");
    assert.equal(kept.inputs[0]?.options, undefined);
  });

  it("기획서에 있는 날짜 선택지와 일반 선택지는 유지한다", () => {
    const text = "검사 결과\n[기준일] 2023-01-01, 2023-02-01 중 선택한다. 판정 상태는 정상/주의/위험";
    const kept = keepRealInputs(
      analysis([
        { target: "기준일", control: "select", options: ["2023-01-01", "2023-02-01"], ...base },
        { target: "판정 상태", control: "select", options: ["정상", "주의", "위험"], ...base },
      ]),
      text,
    );
    assert.equal(kept.inputs[0]?.control, "select");
    assert.deepEqual(kept.inputs[1]?.options, ["정상", "주의", "위험"]);
  });

  it("선택지를 가질 수 없는 text 컨트롤의 선택지는 비운다", () => {
    const text = "검색\n[이름] 이름을 입력한다";
    const kept = keepRealInputs(
      analysis([{ target: "이름", control: "text", options: ["가", "나"], ...base }]),
      text,
    );
    assert.equal(kept.inputs[0]?.options, undefined);
  });
});

describe("isDisplayOnlyQuestion", () => {
  it("이름, 성별로 조회한다 같은 검색 조건 설명은 표시 전용으로 보지 않는다", () => {
    assert.equal(isDisplayOnlyQuestion("사용자 현황\n이름, 성별로 조회한다."), false);
  });
});

describe("isDisplayOnlyQuestion 표시형식", () => {
  it("입력 칸의 형식을 설명하는 표시형식은 표시 전용으로 보지 않는다", () => {
    assert.equal(isDisplayOnlyQuestion("환자정보\n생년월일 표시형식: YYYY-MM-DD"), false);
  });
});
