import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROL_KIND } from "./control-kind.js";
import {
  dateCalendarScopeExpr,
  dateTriggerLocatorExpr,
  generatePlaywrightSpec,
  playwrightLocatorExpr,
  playwrightSpecFileName,
} from "./playwright-spec.js";

const PICKED = "._root_du6a0_1._calendar_o7hka_89";

const SAMPLE = {
  id: "tc-date",
  screenName: "관리자 사용자 현황",
  kind: "success" as const,
  title: "관리자 사용자 현황 · 검사일 필터",
  inputs: [
    {
      target: "검사일 필터",
      value: "2026-10-01,2026-10-13",
      control: CONTROL_KIND.dateRange,
      selector: PICKED,
      selectorStrategy: "css" as const,
    },
  ],
  buttonName: "조회",
  expectedText: "사용자 목록",
};

describe("generatePlaywrightSpec", () => {
  it("고른 셀렉터를 캘린더 스코프로 그대로 넣는다", () => {
    const spec = generatePlaywrightSpec(SAMPLE, {
      startUrl: "https://admin.example.com/users",
    });
    const calendarExpr = dateCalendarScopeExpr(PICKED);
    assert.equal(calendarExpr, "page.locator('._root_du6a0_1._calendar_o7hka_89')");
    assert.equal(playwrightLocatorExpr("css", PICKED), calendarExpr);
    assert.ok(spec.includes(calendarExpr));
    assert.ok(spec.includes(dateTriggerLocatorExpr("검사일 필터")));
    assert.equal(spec.includes("트리거로 쓰지 않는다"), false);
    assert.equal(spec.includes("getByRole('dialog')"), false);
    assert.match(spec, /clickMonthDay\(calendar1, '2026-10-01'\)/);
    assert.match(spec, /clickMonthDay\(calendar1, '2026-10-13'\)/);
    assert.match(spec, /getByRole\('button', \{ name: '조회' \}\)/);
    assert.match(spec, /data-iso=/);
  });

  it("날짜 값이 비어 있으면 빈 날짜를 클릭하지 않는다", () => {
    const spec = generatePlaywrightSpec(
      { ...SAMPLE, inputs: [{ ...SAMPLE.inputs[0], value: "" }] },
      { startUrl: "https://admin.example.com/users" },
    );
    assert.match(spec, /검사일 필터 값이 비어 있습니다/);
    assert.equal(spec.includes("clickMonthDay("), false);
    assert.equal(spec.includes("toHaveText"), false);
  });

  it("파일 이름은 spec.ts 로 끝난다", () => {
    assert.equal(
      playwrightSpecFileName("관리자 사용자 현황 · 검사일 필터"),
      "관리자-사용자-현황-검사일-필터.spec.ts",
    );
  });
});
