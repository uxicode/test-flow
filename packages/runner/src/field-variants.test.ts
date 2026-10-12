import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOptionContainers, DEFAULT_OPTION_CONTAINERS, isPageSizeField, optionVariants } from "./apply-field.js";

describe("buildOptionContainers", () => {
  it("기본 컨테이너 목록을 반환한다", () => {
    assert.equal(buildOptionContainers(), DEFAULT_OPTION_CONTAINERS);
    assert.equal(buildOptionContainers("   "), DEFAULT_OPTION_CONTAINERS);
  });

  it("커스텀 컨테이너 셀렉터를 앞쪽에 포함하여 결합한다", () => {
    const combined = buildOptionContainers(".my-custom-dropdown, [data-popover]");
    assert.ok(combined.startsWith(".my-custom-dropdown, [data-popover], "));
    assert.ok(combined.includes('[role="listbox"]'));
  });
});

describe("isPageSizeField", () => {
  it("목록 표시 개수 관련 필드를 올바르게 인식한다", () => {
    assert.equal(isPageSizeField("목록 표시 개수 설정"), true);
    assert.equal(isPageSizeField("목록 표시 개수"), true);
    assert.equal(isPageSizeField("페이지당 표시 개수"), true);
    assert.equal(isPageSizeField("페이지 크기"), true);
    assert.equal(isPageSizeField("보기 개수"), true);
  });

  it("성별이나 일반 텍스트 필드는 페이지 크기 필드로 보지 않는다", () => {
    assert.equal(isPageSizeField("성별 필터"), false);
    assert.equal(isPageSizeField("이메일"), false);
    assert.equal(isPageSizeField("검색 조건"), false);
  });
});

describe("optionVariants", () => {
  it("숫자 개수 단위 변형을 올바르게 생성한다", () => {
    const variants = optionVariants("20개씩 보기");
    assert.ok(variants.includes("20개씩 보기"));
    assert.ok(variants.includes("20개씩"));
    assert.ok(variants.includes("20개"));
    assert.ok(variants.includes("20"));
  });

  it("30개씩 보기 변형을 올바르게 생성한다", () => {
    const variants = optionVariants("30개씩 보기");
    assert.ok(variants.includes("30개씩 보기"));
    assert.ok(variants.includes("30개씩"));
    assert.ok(variants.includes("30개"));
    assert.ok(variants.includes("30"));
  });

  it("'30개 보기' 입력도 '30개씩 보기'로 매칭되도록 변형을 생성한다", () => {
    const variants = optionVariants("30개 보기");
    assert.ok(variants.includes("30개씩 보기"));
    assert.ok(variants.includes("30개"));
  });
});
