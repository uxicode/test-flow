import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { textShowsValue } from "./apply-field.js";
import { checkTableRows, type ExtractedTable } from "./table-assert.js";

const table: ExtractedTable = {
  headers: ["번호", "상태"],
  rows: [
    ["1", "완료"],
    ["2", "완료"],
  ],
};

describe("checkTableRows", () => {
  it("모든 행이 같으면 통과한다", () => {
    const result = checkTableRows([table], { type: "table", column: "상태", every: "equals", value: "완료" });
    assert.equal(result.ok, true);
  });

  it("'미완료' 행이 섞이면 실패한다", () => {
    const mixed: ExtractedTable = { ...table, rows: [...table.rows, ["3", "미완료"]] };
    const result = checkTableRows([mixed], { type: "table", column: "상태", every: "equals", value: "완료" });
    assert.equal(result.ok, false);
    assert.match(result.message, /3번째/u);
  });

  it("행이 minRows보다 적으면 실패한다", () => {
    const empty: ExtractedTable = { headers: table.headers, rows: [] };
    const result = checkTableRows([empty], { type: "table", column: "상태", every: "equals", value: "완료" });
    assert.equal(result.ok, false);
  });

  it("열이 없으면 실패한다", () => {
    const result = checkTableRows([table], { type: "table", column: "성별", every: "equals", value: "남성" });
    assert.equal(result.ok, false);
  });
});

describe("textShowsValue", () => {
  it("정확히 같은 줄만 인정한다", () => {
    assert.equal(textShowsValue("완료", ["완료"]), true);
    assert.equal(textShowsValue("미완료", ["완료"]), false);
    assert.equal(textShowsValue("130개씩 보기", ["30개씩 보기"]), false);
    assert.equal(textShowsValue("30개씩  보기", ["30개씩 보기"]), true);
  });
});
