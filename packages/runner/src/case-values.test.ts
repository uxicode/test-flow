import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestCase } from "@testflow/tc";
import { isLoginCase, isLoginStartUrl, needsSharedLogin, valuesForCase } from "./case-values.js";

const success: TestCase = {
  id: "s",
  screenName: "로그인",
  kind: "success",
  title: "로그인 성공",
  inputs: [{ target: "이메일", value: "" }],
  buttonName: "로그인",
  expectedText: "대시보드",
};

const adminFailure: TestCase = {
  id: "f",
  screenName: "관리자 사용자 현황",
  kind: "failure",
  title: "관리자 사용자 현황 - 이름 실패",
  inputs: [{ target: "이름", value: "이름" }],
  buttonName: "조회",
  expectedText: "이름을 입력해주세요.",
};

describe("valuesForCase", () => {
  it("성공 경로 값이 비어 있으면 입력 항목 이름으로 멈춘다", () => {
    assert.throws(() => valuesForCase(success, {}), /이메일 값이 비어 있습니다/);
  });

  it("필수 입력 실패는 칸 이름이 들어 있어도 비운다", () => {
    assert.deepEqual(valuesForCase(adminFailure, {}), [{ target: "이름", value: "" }]);
  });

  it("실패 대응은 케이스에 들어 있는 조건 밖 값을 쓴다", () => {
    const failure: TestCase = {
      ...success,
      kind: "failure",
      inputs: [{ target: "이메일", value: "not-an-email" }],
    };
    assert.deepEqual(valuesForCase(failure, { 이메일: "real@example.com" }), [
      { target: "이메일", value: "not-an-email" },
    ]);
  });
});

describe("isLoginCase", () => {
  it("로그인 화면·계정 칸 TC만 로그인 케이스로 본다", () => {
    assert.equal(isLoginCase(success), true);
    assert.equal(isLoginCase({ ...success, inputs: [], buttonName: "로그인" }), true);
    assert.equal(isLoginCase(adminFailure), false);
  });
});

describe("isLoginStartUrl", () => {
  it("경로가 로그인인 URL만 로그인 주소로 본다", () => {
    assert.equal(isLoginStartUrl("https://admin.example.com/login"), true);
    assert.equal(isLoginStartUrl("https://admin.example.com/users"), false);
  });
});

describe("needsSharedLogin", () => {
  const login = { email: "user@example.com", password: "secret" };

  it("로그인 칸이 없는 확인 TC는 공통 계정으로 먼저 들어간다", () => {
    assert.equal(needsSharedLogin({ kind: "success", inputs: [], screenName: "대시보드", buttonName: "저장" }, login), true);
  });

  it("어드민 실패 대응도 로그인이 필요하면 공통 계정으로 먼저 들어간다", () => {
    assert.equal(needsSharedLogin(adminFailure, login), true);
  });

  it("이미 이메일이나 비밀번호를 넣는 TC는 공통 로그인을 건너뛴다", () => {
    assert.equal(needsSharedLogin(success, login), false);
    assert.equal(needsSharedLogin({ kind: "success", inputs: [], screenName: "대시보드", buttonName: "저장" }, undefined), false);
  });
});
