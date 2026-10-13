import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROL_KIND } from "./control-kind.js";
import { generatePlaywrightSpec, playwrightSpecFileName } from "./playwright-spec.js";

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
      selector: "._root_du6a0_1._calendar_o7hka_89",
      selectorStrategy: "css" as const,
    },
  ],
  buttonName: "조회",
  expectedText: "사용자 목록",
};

describe("generatePlaywrightSpec", () => {
  it("실행 가능한 Playwright spec 을 만든다", () => {
    const spec = generatePlaywrightSpec(SAMPLE, {
      startUrl: "https://admin.example.com/users",
    });
    assert.match(spec, /import \{ test, expect/);
    assert.match(spec, /from '@playwright\/test'/);
    assert.match(spec, /page\.goto\('https:\/\/admin\.example.com\/users'\)/);
    assert.match(spec, /clickMonthDay\(dateDialog, '2026-10-01'\)/);
    assert.match(spec, /clickMonthDay\(dateDialog, '2026-10-13'\)/);
    assert.match(spec, /getByRole\('button', \{ name: '조회' \}\)/);
    assert.match(spec, /사용자 목록/);
    assert.match(spec, /CSS 모듈 해시/);
  });

  it("파일 이름은 spec.ts 로 끝난다", () => {
    assert.equal(
      playwrightSpecFileName("관리자 사용자 현황 · 검사일 필터"),
      "관리자-사용자-현황-검사일-필터.spec.ts",
    );
  });
});
