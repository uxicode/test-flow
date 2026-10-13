import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateValueMatches } from "./click-calendar-day-script.js";

describe("dateValueMatches", () => {
  it("ISO·점·슬래시·압축 형식을 전체 날짜로 인정한다", () => {
    assert.equal(dateValueMatches("2026-10-01", 2026, 10, 1), true);
    assert.equal(dateValueMatches("2026.10.01", 2026, 10, 1), true);
    assert.equal(dateValueMatches("2026/10/01", 2026, 10, 1), true);
    assert.equal(dateValueMatches("20261001", 2026, 10, 1), true);
    assert.equal(dateValueMatches("2026-10-1", 2026, 10, 1), true);
    assert.equal(dateValueMatches("2026.10.1", 2026, 10, 1), true);
  });

  it("한글 날짜와 접두 레이블을 인정한다", () => {
    assert.equal(dateValueMatches("2026년 10월 1일", 2026, 10, 1), true);
    assert.equal(dateValueMatches("2026년 10월 01일", 2026, 10, 1), true);
    assert.equal(dateValueMatches("오늘 2026년 10월 13일", 2026, 10, 13), true);
    assert.equal(dateValueMatches("2026년10월13일", 2026, 10, 13), true);
  });

  it("부분 문자열 날짜는 거절한다", () => {
    assert.equal(dateValueMatches("2026-10-13", 2026, 10, 1), false);
    assert.equal(dateValueMatches("2026.10.13", 2026, 10, 1), false);
    assert.equal(dateValueMatches("2026년 10월 13일", 2026, 10, 1), false);
    assert.equal(dateValueMatches("2026년 10월 11일", 2026, 10, 1), false);
    assert.equal(dateValueMatches("2026년 10월 21일", 2026, 10, 1), false);
    assert.equal(dateValueMatches("1", 2026, 10, 1), false);
    assert.equal(dateValueMatches("13", 2026, 10, 13), false);
    assert.equal(dateValueMatches("오늘", 2026, 10, 13), false);
  });
});
