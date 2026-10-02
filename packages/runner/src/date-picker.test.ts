import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDateRangeValue,
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

describe("defaultDateRangeValue", () => {
  it("이번 달 1일부터 오늘까지", () => {
    assert.match(defaultDateRangeValue(), /^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/u);
  });
});
