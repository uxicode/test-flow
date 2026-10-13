import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDateRangeValue,
  displayedRangeMatches,
  parseDateRangeValue,
  parseSingleDate,
} from "./date-picker.js";

describe("parseSingleDate", () => {
  it("점 구분 날짜를 파싱한다", () => {
    assert.deepEqual(parseSingleDate("2026.10.01"), {
      year: 2026,
      month: 10,
      day: 1,
    });
  });
});

describe("parseDateRangeValue", () => {
  it("물결표 기간을 파싱한다", () => {
    const range = parseDateRangeValue("2026.10.01 ~ 2026.11.24");
    assert.deepEqual(range?.start, { year: 2026, month: 10, day: 1 });
    assert.deepEqual(range?.end, { year: 2026, month: 11, day: 24 });
  });

  it("쉼표 구분 기간을 파싱한다", () => {
    const range = parseDateRangeValue("2026-10-01,2026-11-24");
    assert.equal(range?.end.day, 24);
  });
});

describe("displayedRangeMatches", () => {
  const requested = {
    start: { year: 2026, month: 10, day: 1 },
    end: { year: 2026, month: 10, day: 13 },
  };

  it("시작일만 있으면 실패한다", () => {
    assert.equal(displayedRangeMatches("2026.10.13 ~", requested), false);
  });

  it("요청과 같은 범위만 통과한다", () => {
    assert.equal(displayedRangeMatches("2026.10.01 ~ 2026.10.13", requested), true);
    assert.equal(displayedRangeMatches("2026.10.13 ~ 2026.10.13", requested), false);
  });
});

describe("defaultDateRangeValue", () => {
  it("이번 달 1일부터 오늘까지", () => {
    assert.match(defaultDateRangeValue(), /^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/u);
  });
});
