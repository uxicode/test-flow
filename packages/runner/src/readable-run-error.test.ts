import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readableRunError } from "./run-case.js";

describe("readableRunError", () => {
  it("브라우저가 닫히면 그 사실을 보고한다", () => {
    assert.equal(
      readableRunError(new Error("Target page, context or browser has been closed"), "대시보드"),
      "브라우저가 닫혀 실행이 끝났습니다.",
    );
  });

  it("기대 문구가 없으면 그 문구를 보고한다", () => {
    assert.equal(
      readableRunError(new Error("Timeout 15000ms exceeded"), "대시보드"),
      '화면에 "대시보드" 가 보이지 않습니다.',
    );
  });
});