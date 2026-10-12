import type { TcTableAssert } from "@testflow/tc";
import type { Page } from "playwright";

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

export interface AssertResult {
  ok: boolean;
  message: string;
}

function clean(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** 화면의 모든 표(table 태그, role=table/grid)에서 헤더와 본문 행 텍스트를 뽑는다. */
export async function extractTables(page: Page): Promise<ExtractedTable[]> {
  return page.evaluate(() => {
    const text = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const tables = Array.from(
      document.querySelectorAll('table, [role="table"], [role="grid"]'),
    );
    return tables.map((table) => {
      const headerCells = Array.from(
        table.querySelectorAll('thead th, thead td, [role="columnheader"]'),
      );
      const headers = headerCells.map(text);
      const rowEls = Array.from(
        table.querySelectorAll('tbody tr, [role="row"]'),
      ).filter((row) => row.querySelector('td, [role="cell"], [role="gridcell"]'));
      const rows = rowEls.map((row) =>
        Array.from(row.querySelectorAll('td, [role="cell"], [role="gridcell"]')).map(text),
      );
      return { headers, rows };
    });
  });
}

function matches(cell: string, assert: TcTableAssert): boolean {
  const actual = clean(cell);
  const expected = clean(assert.value);
  return assert.every === "contains" ? actual.includes(expected) : actual === expected;
}

/** 열 이름이 정확히 같은 표를 찾아, 모든 행이 조건을 만족하는지와 최소 행 수를 검사한다. */
export function checkTableRows(tables: ExtractedTable[], assert: TcTableAssert): AssertResult {
  const column = clean(assert.column);
  const minRows = assert.minRows ?? 1;
  const table = tables.find((item) => item.headers.some((header) => clean(header) === column));
  if (!table) return { ok: false, message: `"${assert.column}" 열을 가진 표를 찾지 못했습니다.` };

  const index = table.headers.findIndex((header) => clean(header) === column);
  if (table.rows.length < minRows) {
    return {
      ok: false,
      message: `"${assert.column}" 열 검증 실패: 행이 ${table.rows.length}개로 최소 ${minRows}개에 못 미칩니다.`,
    };
  }
  const bad = table.rows.findIndex((row) => !matches(row[index] ?? "", assert));
  if (bad >= 0) {
    const actual = clean(table.rows[bad]?.[index] ?? "");
    return {
      ok: false,
      message: `"${assert.column}" 열 ${bad + 1}번째 행이 "${actual}" 입니다. 기대 값: "${assert.value}"`,
    };
  }
  return {
    ok: true,
    message: `"${assert.column}" 열 ${table.rows.length}개 행이 모두 "${assert.value}" 입니다.`,
  };
}
