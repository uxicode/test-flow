import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buttonNameVariants } from "./run-case.js";

describe("buttonNameVariants", () => {
  it("조회 버튼 이름에 대해 조회하기와 검색 변형을 포함한다", () => {
    const variants = buttonNameVariants("조회");
    assert.ok(variants.includes("조회"));
    assert.ok(variants.includes("조회하기"));
    assert.ok(variants.includes("검색"));
  });

  it("조회하기 버튼 이름에 대해 조회 명사형을 포함한다", () => {
    const variants = buttonNameVariants("조회하기");
    assert.ok(variants.includes("조회하기"));
    assert.ok(variants.includes("조회"));
  });

  it("접미사 ' 버튼'이 붙은 경우 제거하여 변형을 생성한다", () => {
    const variants = buttonNameVariants("조회 버튼");
    assert.ok(variants.includes("조회"));
    assert.ok(variants.includes("조회하기"));
  });

  it("저장 및 확인 등 상용 동사 활용형을 올바르게 처리한다", () => {
    const saveVariants = buttonNameVariants("저장");
    assert.ok(saveVariants.includes("저장하기"));
    assert.ok(saveVariants.includes("등록"));

    const confirmVariants = buttonNameVariants("확인하기");
    assert.ok(confirmVariants.includes("확인"));
  });
});
