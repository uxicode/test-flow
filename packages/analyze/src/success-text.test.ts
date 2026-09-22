import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillMissingSuccess, successTextFromSpec } from "./success-text.js";

describe("successTextFromSpec", () => {
  it("성공 후 이동하는 화면 이름을 뽑는다", () => {
    const text = [
      "[이메일 입력] 형식이 올바르지 않을 경우 에러 메시지를 노출한다",
      "[로그인] 로그인 성공 시 관리자 메인 화면으로 이동",
    ].join("\n");
    assert.equal(successTextFromSpec(text), "관리자 메인 화면");
  });

  it("실패 문장에서는 성공 문구를 만들지 않는다", () => {
    assert.equal(successTextFromSpec("[이메일 입력] 형식이 올바르지 않을 경우 에러 메시지를 노출한다"), "");
  });
});

describe("fillMissingSuccess", () => {
  it("모델이 비운 성공 문구를 기획서에서 채운다", () => {
    const screens = fillMissingSuccess(
      [
        {
          screenKey: "screen-1",
          screenName: "관리자 로그인",
          inputs: [{ target: "이메일", constraint: "형식", warning: "형식 오류", failureExample: "bad" }],
          successText: "",
          buttonName: "로그인",
        },
      ],
      [
        {
          id: "q-1",
          screenKey: "screen-1",
          screenName: "관리자 로그인",
          text: "[로그인] 로그인 성공 시 대시보드로 이동",
        },
      ],
    );
    assert.equal(screens[0]?.successText, "대시보드");
  });
});
