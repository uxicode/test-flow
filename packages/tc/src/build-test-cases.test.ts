import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTestCases } from "./build-test-cases.js";

describe("buildTestCases", () => {
  it("성공 값은 비우고 실패 대응은 조건 밖 값을 넣는다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 로그인",
        inputs: [
          {
            target: "이메일",
            constraint: "이메일 형식",
            warning: "올바른 이메일 형식을 입력해주세요.",
            failureExample: "",
          },
        ],
        successText: "대시보드",
        buttonName: "로그인",
      },
    ]);
    assert.equal(cases.length, 2);
    assert.equal(cases[0]?.kind, "success");
    assert.equal(cases[0]?.inputs[0]?.value, "");
    assert.equal(cases[1]?.kind, "failure");
    assert.equal(cases[1]?.inputs[0]?.value, "not-an-email");
    assert.equal(cases[1]?.expectedText, "올바른 이메일 형식을 입력해주세요.");
  });

  it("필수 입력 경고는 칸 이름을 값으로 넣지 않고 비운다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 사용자 현황",
        inputs: [
          {
            target: "이름",
            constraint: "필수",
            warning: "이름을 입력해주세요.",
            failureExample: "이름",
          },
        ],
        successText: "",
        buttonName: "조회",
      },
    ]);
    assert.equal(cases[0]?.kind, "failure");
    assert.equal(cases[0]?.inputs[0]?.value, "");
  });

  it("성공 경로는 이메일 다음 비밀번호만 한 번씩 묻는다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 로그인",
        inputs: [
          {
            target: "비밀번호 입력",
            constraint: "길이",
            warning: "비밀번호 규칙을 확인해주세요.",
            failureExample: "123",
          },
          {
            target: "이메일",
            constraint: "형식",
            warning: "올바른 이메일 형식을 입력해주세요.",
            failureExample: "",
          },
          {
            target: "이메일 입력",
            constraint: "형식",
            warning: "올바른 이메일 형식을 입력해주세요.",
            failureExample: "test",
          },
          {
            target: "비밀번호",
            constraint: "길이",
            warning: "비밀번호는 최소 8자 이상이어야 합니다.",
            failureExample: "123",
          },
        ],
        successText: "관리자 메인 화면으로 이동",
        buttonName: "로그인",
      },
    ]);
    const success = cases.find((item) => item.kind === "success");
    assert.deepEqual(success?.inputs.map((input) => input.target), ["이메일", "비밀번호"]);
    const emailFailures = cases.filter((item) => item.kind === "failure" && item.inputs[0]?.target === "이메일");
    assert.equal(emailFailures.length, 1);
  });

  it("성공 문구와 오류 문장이 없어도 기능 행마다 확인 TC를 만든다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 대시보드",
        inputs: [],
        successText: "",
        buttonName: "",
        features: [
          { title: "오늘", body: "오늘 지표를 보여 준다" },
          { title: "최근 7일", body: "최근 7일 지표를 보여 준다" },
        ],
      },
    ]);
    assert.equal(cases.length, 2);
    assert.equal(cases[0]?.title, "관리자 대시보드 · 오늘");
    assert.equal(cases[0]?.expectedText, "오늘");
    assert.equal(cases[0]?.buttonName, "");
    assert.deepEqual(cases[0]?.inputs, []);
  });

  it("조회 화면은 기획 기능 행마다 TC를 나누고 입력 칸을 한꺼번에 묶지 않는다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 사용자 현황",
        inputs: [
          { target: "이름", constraint: "", warning: "", failureExample: "" },
          { target: "성별", constraint: "", warning: "", failureExample: "" },
          { target: "검색어", constraint: "", warning: "", failureExample: "" },
          { target: "이름", constraint: "", warning: "", failureExample: "" },
        ],
        successText: "사용자 목록 조회",
        buttonName: "조회",
        features: [
          { title: "이름", body: "이름으로 조회에 성공하면 목록이 바뀐다" },
          { title: "성별", body: "성별을 선택하면 목록이 바뀐다" },
          { title: "검색어", body: "검색어로 조회한다" },
          { title: "초기화", body: "검색 조건을 비운다" },
        ],
      },
    ]);
    const success = cases.filter((item) => item.kind === "success");
    assert.deepEqual(success.map((item) => item.title), [
      "관리자 사용자 현황 · 이름",
      "관리자 사용자 현황 · 성별",
      "관리자 사용자 현황 · 검색어",
      "관리자 사용자 현황 · 초기화",
    ]);
    for (const item of success) {
      assert.ok(item.inputs.length <= 1, item.title);
      assert.ok(!item.id.endsWith("-success"), item.id);
    }
    assert.ok(success.every((item) => item.inputs.length <= 1 || item.buttonName === "조회"));
    assert.equal(cases.some((item) => item.title.endsWith("성공")), false);
    assert.equal(cases.filter((item) => item.id.includes("check")).length, 0);
  });

  it("기능 행이 없고 입력 칸만 여러 개면 칸마다 TC를 만든다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 사용자 현황",
        inputs: [
          { target: "이름", constraint: "", warning: "", failureExample: "" },
          { target: "성별", constraint: "", warning: "", failureExample: "" },
        ],
        successText: "사용자 목록 조회",
        buttonName: "조회",
      },
    ]);
    const success = cases.filter((item) => item.kind === "success");
    assert.equal(success.length, 2);
    assert.ok(success.every((item) => item.inputs.length === 1));
  });

  it("이미 성공·실패로 만든 기능 행은 확인 TC로 다시 만들지 않는다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 로그인",
        inputs: [
          {
            target: "이메일",
            constraint: "형식",
            warning: "올바른 이메일 형식을 입력해주세요.",
            failureExample: "",
          },
        ],
        successText: "대시보드",
        buttonName: "로그인",
        features: [
          { title: "이메일 입력", body: "형식이 올바르지 않을 경우 올바른 이메일 형식을 입력해주세요." },
          { title: "로그인", body: "로그인 성공 시 대시보드로 이동" },
          { title: "비밀번호 찾기", body: "비밀번호 찾기 화면으로 들어간다" },
        ],
      },
    ]);
    assert.equal(cases.filter((item) => item.id.includes("check")).length, 1);
    assert.equal(cases.at(-1)?.expectedText, "비밀번호 찾기");
  });
});
