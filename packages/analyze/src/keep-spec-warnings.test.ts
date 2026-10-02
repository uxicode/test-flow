import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keepSpecWarnings } from "./keep-spec-warnings.js";
import type { ScreenAnalysis } from "./types.js";

function screen(warning: string): ScreenAnalysis {
  return {
    screenKey: "screen-1",
    screenName: "관리자 사용자 현황",
    inputs: [
      {
        target: "이름",
        constraint: "필수",
        warning,
        failureExample: "이름",
      },
    ],
    successText: "",
    buttonName: "조회",
  };
}

describe("keepSpecWarnings", () => {
  it("기획서에 없는 경고는 버린다", () => {
    const kept = keepSpecWarnings(
      screen("이름을 입력해주세요."),
      "사용자 현황\n이름, 성별, 등록일로 조회한다.\n조회 버튼을 누르면 목록을 보여 준다.",
    );
    assert.equal(kept.inputs[0]?.warning, "");
    assert.equal(kept.inputs[0]?.failureExample, "");
  });

  it("기획서에 적힌 오류 문장은 남긴다", () => {
    const kept = keepSpecWarnings(
      screen("올바른 이메일 형식을 입력해주세요."),
      '[이메일 입력] 형식이 아니면 "올바른 이메일 형식을 입력해주세요" 를 보여 준다.',
    );
    assert.equal(kept.inputs[0]?.warning, "올바른 이메일 형식을 입력해주세요.");
  });
});
