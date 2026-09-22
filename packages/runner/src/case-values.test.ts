import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestCase } from "@testflow/tc";
import { needsSharedLogin, valuesForCase } from "./case-values.js";

const success: TestCase = {
  id: "s",
  screenName: "로그인",
  kind: "success",
  title: "로그인 성공",
  inputs: [{ target: "이메일", value: "" }],
  buttonName: "로그인",
  expectedText: "대시보드",
};

describe("valuesForCase", () => {
  it("성공 경로 값이 비어 있으면 입력 항목 이름으로 멈춘다", () => {
    assert.throws(() => valuesForCase(success, {}), /이메일 값이 비어 있습니다/);
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

describe("needsSharedLogin", () => {
  const login = { email: "user@example.com", password: "secret" };

  it("로그인 칸이 없는 확인 TC는 공통 계정으로 먼저 들어간다", () => {
    assert.equal(needsSharedLogin({ kind: "success", inputs: [] }, login), true);
  });

  it("이미 이메일이나 비밀번호를 넣는 TC와 실패 대응은 공통 로그인을 건너뛴다", () => {
    assert.equal(needsSharedLogin(success, login), false);
    assert.equal(needsSharedLogin({ ...success, kind: "failure", inputs: [] }, login), false);
    assert.equal(needsSharedLogin({ kind: "success", inputs: [] }, undefined), false);
  });
});
