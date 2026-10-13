import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROL_KIND } from "./control-kind.js";
import { DATE_VALUE_MATCHES_SOURCE } from "./click-calendar-day-script.js";
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
    assert.ok(spec.includes("dateValueMatches"), "spec 이 속성 값으로 날짜를 찾아야 한다");
    assert.ok(
      spec.replace(/\s+/g, " ").includes(DATE_VALUE_MATCHES_SOURCE.replace(/\s+/g, " ")),
      "러너와 같은 날짜 값 매칭을 써야 한다",
    );
    assert.equal(spec.includes("[data-date=\"' + payload.iso"), false);
    assert.equal(spec.includes("[data-iso=\"' + payload.iso"), false);
    assert.equal(spec.includes("[title=\"' + payload.iso"), false);
  });

  it("파일 이름은 spec.ts 로 끝난다", () => {
    assert.equal(
      playwrightSpecFileName("관리자 사용자 현황 · 검사일 필터"),
      "관리자-사용자-현황-검사일-필터.spec.ts",
    );
  });
});
