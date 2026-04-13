import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findTcHeaderRowIndex,
  parseAssertionCell,
  parseTcSheetMatrix,
} from "./excelParser.js";

describe("findTcHeaderRowIndex", () => {
  it("finds header after summary block", () => {
    const matrix: unknown[][] = [
      ["", "", "summary"],
      ["", "정책 ID", "테스트케이스ID", "우선순위", "1 Depth", "기대결과"],
    ];
    assert.equal(findTcHeaderRowIndex(matrix), 1);
  });
});

describe("parseAssertionCell", () => {
  it("parses visible", () => {
    const { assertion, error } = parseAssertionCell("visible:x", {
      sheet: "S",
      row: 1,
    });
    assert.equal(error, undefined);
    assert.deepEqual(assertion, { type: "visible", target: "x" });
  });
});

describe("parseTcSheetMatrix", () => {
  it("parses policy rows and groups by policyId", () => {
    const matrix: unknown[][] = [
      ["", "정책 ID", "테스트케이스ID", "우선순위", "1 Depth", "2 Depth", "사전조건", "기대결과"],
      ["", "", "", "", "", "", "ver.", ""],
      ["", "P-1", "1", "P1", "GNB", "메뉴", "", "기대A"],
      ["", "P-1", "2", "P2", "", "서브", "전제", "기대B"],
      ["", "P-2", "1", "P1", "탭", "", "", "기대C"],
    ];
    const diag = { errors: [] as string[], warnings: [] as string[] };
    const list = parseTcSheetMatrix("Sheet1", matrix, diag);
    assert.equal(list.length, 2);
    const p1 = list.find((x) => x.policyId === "P-1");
    assert.ok(p1);
    assert.equal(p1!.cases.length, 2);
    assert.equal(p1!.cases[0].expected, "기대A");
    assert.deepEqual(p1!.cases[0].depthPath, ["GNB", "메뉴"]);
    assert.equal(p1!.feature, "Sheet1_P-1");
    const p2 = list.find((x) => x.policyId === "P-2");
    assert.ok(p2);
    assert.equal(p2!.cases.length, 1);
  });
});
