import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findShownPhrase, openedScreenTitle, phrasesToFind } from "./match-phrase.js";

const expected = `형식이 올바르지 않을 경우 에러 메시지 노출
("올바른 이메일 형식을 입력해주세요.")`;

describe("phrasesToFind", () => {
  it("기획 설명 대신 따옴표 안 문구를 기대값으로 쓴다", () => {
    assert.deepEqual(phrasesToFind(expected), ["올바른 이메일 형식을 입력해주세요"]);
  });
});

describe("findShownPhrase", () => {
  it("화면에 비슷한 경고가 있으면 그 문장을 찾는다", () => {
    const page = [
      "Solaseado Care",
      "올바른 이메일 주소를 입력해주세요.",
      "영문, 숫자, 특수문자 포함 8~16자리",
      "로그인",
    ].join("\n");
    assert.equal(findShownPhrase(page, phrasesToFind(expected)), "올바른 이메일 주소를 입력해주세요.");
  });

  it("다른 문구는 경고로 보지 않는다", () => {
    assert.equal(findShownPhrase("비밀번호를 입력해주세요.", phrasesToFind(expected)), null);
  });
});

describe("openedScreenTitle", () => {
  it("로그인 다음 화면에서 반복된 화면 이름을 고른다", () => {
    const page = [
      "AI 케어 해남",
      "대시보드",
      "사용자 현황",
      "검사 결과",
      "대시보드",
      "주요 운영 지표",
    ].join("\n");
    assert.equal(openedScreenTitle(page), "대시보드");
  });
});
