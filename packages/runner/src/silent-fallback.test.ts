import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROL_KIND } from "@testflow/tc";

/**
 * apply-field.ts 의 무음 폴백 제거 동작을 검증한다.
 * Playwright 없이 순수 로직만 테스트한다.
 */

describe("CONTROL_KIND 단일 정의", () => {
  it("password, textarea, file 이 CONTROL_KIND 에 포함된다", () => {
    assert.equal(CONTROL_KIND.password, "password");
    assert.equal(CONTROL_KIND.textarea, "textarea");
    assert.equal(CONTROL_KIND.file, "file");
  });

  it("기존 타입이 유지된다", () => {
    assert.equal(CONTROL_KIND.text, "text");
    assert.equal(CONTROL_KIND.select, "select");
    assert.equal(CONTROL_KIND.radio, "radio");
    assert.equal(CONTROL_KIND.checkbox, "checkbox");
    assert.equal(CONTROL_KIND.date, "date");
    assert.equal(CONTROL_KIND.dateRange, "date_range");
    assert.equal(CONTROL_KIND.combobox, "combobox");
  });
});

describe("parseControlKind", () => {
  it("password, textarea, file 을 올바르게 파싱한다", async () => {
    const { parseControlKind } = await import("@testflow/tc");
    assert.equal(parseControlKind("password"), "password");
    assert.equal(parseControlKind("textarea"), "textarea");
    assert.equal(parseControlKind("file"), "file");
  });

  it("기존 별칭이 그대로 동작한다", async () => {
    const { parseControlKind } = await import("@testflow/tc");
    assert.equal(parseControlKind("input"), "text");
    assert.equal(parseControlKind("dropdown"), "select");
    assert.equal(parseControlKind("check"), "checkbox");
    assert.equal(parseControlKind("datepicker"), "date");
    assert.equal(parseControlKind("daterange"), "date_range");
    assert.equal(parseControlKind("dropdown-button"), "combobox");
  });

  it("알 수 없는 값은 undefined 를 반환한다", async () => {
    const { parseControlKind } = await import("@testflow/tc");
    assert.equal(parseControlKind("unknown"), undefined);
    assert.equal(parseControlKind(42), undefined);
    assert.equal(parseControlKind(null), undefined);
  });
});
