import * as XLSX from "xlsx";
import type {
  ExcelAssertion,
  ExcelAutomationAction,
  ExcelAutomationSlice,
  ExcelTcCaseRow,
  ExcelTestCase,
} from "./excelTestCaseTypes.js";

// ---------------------------------------------------------------------------
// Optional assertion mini-DSL (자동화 열 `assertion` 전용)
// visible:<testId> | text:<testId>:<expected> | url:<expected>
// ---------------------------------------------------------------------------

export interface ExcelParseDiagnostics {
  errors: string[];
  warnings: string[];
}

export interface ExcelParseResult {
  features: ExcelTestCase[];
  diagnostics: ExcelParseDiagnostics;
}

function normCell(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ");
}

/** Which logical column each spreadsheet column maps to. */
interface TcColumnMap {
  policyId: number;
  caseId: number;
  priority?: number;
  depth: (number | undefined)[];
  precondition?: number;
  expected: number;
  chrome?: number;
  edge?: number;
  defect?: number;
  testId?: number;
  action?: number;
  value?: number;
  assertion?: number;
}

function matchColumnLabel(raw: string): keyof TcColumnMap | "depth" | null {
  const n = normCell(raw);
  if (!n) return null;
  if (n.includes("정책") && (n.includes("id") || n.endsWith("id")))
    return "policyId";
  if (n.includes("테스트케이스") && (n.includes("id") || n.endsWith("id")))
    return "caseId";
  if (n === "우선순위" || n === "priority") return "priority";
  const depthMatch = /^(\d)\s*depth$/.exec(n);
  if (depthMatch) return "depth";
  if (n.includes("사전") && n.includes("조건")) return "precondition";
  if (n.includes("기대") && n.includes("결과")) return "expected";
  if (n === "chrome") return "chrome";
  if (n === "edge") return "edge";
  if (n.includes("결함") || (n.includes("비고") && !n.includes("기대")))
    return "defect";
  if (n === "test_id" || n === "testid" || n === "테스트id") return "testId";
  if (n === "action" || n === "동작") return "action";
  if (n === "value" || n === "입력값" || n === "값") return "value";
  if (n === "assertion" || n === "검증") return "assertion";
  return null;
}

function buildTcColumnMap(headerRow: unknown[]): TcColumnMap | null {
  const depthCols: (number | undefined)[] = Array.from({ length: 7 }, () => undefined);
  const partial: Partial<TcColumnMap> & { depth: (number | undefined)[] } = {
    depth: depthCols,
  };

  for (let c = 0; c < headerRow.length; c++) {
    const raw = String(headerRow[c] ?? "").trim();
    if (!raw) continue;
    const kind = matchColumnLabel(raw);
    if (!kind) continue;
    if (kind === "depth") {
      const n = normCell(raw);
      const m = /^(\d)\s*depth$/.exec(n);
      if (m) {
        const d = Number(m[1]);
        if (d >= 1 && d <= 7) depthCols[d - 1] = c;
      }
      continue;
    }
    const key = kind as keyof TcColumnMap;
    if (key === "depth") continue;
    if (partial[key] !== undefined) continue;
    switch (key) {
      case "policyId":
        partial.policyId = c;
        break;
      case "caseId":
        partial.caseId = c;
        break;
      case "expected":
        partial.expected = c;
        break;
      case "priority":
        partial.priority = c;
        break;
      case "precondition":
        partial.precondition = c;
        break;
      case "chrome":
        partial.chrome = c;
        break;
      case "edge":
        partial.edge = c;
        break;
      case "defect":
        partial.defect = c;
        break;
      case "testId":
        partial.testId = c;
        break;
      case "action":
        partial.action = c;
        break;
      case "value":
        partial.value = c;
        break;
      case "assertion":
        partial.assertion = c;
        break;
      default:
        break;
    }
  }

  if (
    partial.policyId === undefined ||
    partial.caseId === undefined ||
    partial.expected === undefined
  )
    return null;

  return {
    policyId: partial.policyId,
    caseId: partial.caseId,
    expected: partial.expected,
    priority: partial.priority,
    precondition: partial.precondition,
    chrome: partial.chrome,
    edge: partial.edge,
    defect: partial.defect,
    testId: partial.testId,
    action: partial.action,
    value: partial.value,
    assertion: partial.assertion,
    depth: depthCols,
  };
}

function cellStr(row: unknown[], col: number | undefined): string {
  if (col === undefined) return "";
  const v = row[col];
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return String(v).trim();
}

/** 헤더 다음 행이 Chrome/Edge ver. 보조 행인지 */
function isBrowserSubheaderRow(row: unknown[]): boolean {
  const joined = row.map((c) => normCell(String(c ?? ""))).join(" ");
  return joined.includes("ver.");
}

export function findTcHeaderRowIndex(matrix: unknown[][]): number {
  const maxScan = Math.min(matrix.length, 120);
  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    if (buildTcColumnMap(row)) return r;
  }
  return -1;
}

export function parseAssertionCell(
  raw: string,
  ctx: { sheet: string; row: number },
): { assertion: ExcelAssertion | null; error?: string } {
  const s = raw.trim();
  if (!s) return { assertion: null };

  const lower = s.toLowerCase();
  if (lower.startsWith("visible:")) {
    const target = s.slice("visible:".length).trim();
    if (!target)
      return {
        assertion: null,
        error: `${ctx.sheet} R${ctx.row}: assertion visible — missing target (testId)`,
      };
    return { assertion: { type: "visible", target } };
  }
  if (lower.startsWith("text:")) {
    const rest = s.slice("text:".length);
    const idx = rest.indexOf(":");
    if (idx < 0)
      return {
        assertion: null,
        error: `${ctx.sheet} R${ctx.row}: assertion text — use text:testId:expected`,
      };
    const target = rest.slice(0, idx).trim();
    const expected = rest.slice(idx + 1);
    if (!target)
      return {
        assertion: null,
        error: `${ctx.sheet} R${ctx.row}: assertion text — missing testId`,
      };
    if (!expected)
      return {
        assertion: null,
        error: `${ctx.sheet} R${ctx.row}: assertion text — missing expected string`,
      };
    return { assertion: { type: "text", target, expected } };
  }
  if (lower.startsWith("url:")) {
    const expected = s.slice("url:".length).trim();
    if (!expected)
      return {
        assertion: null,
        error: `${ctx.sheet} R${ctx.row}: assertion url — missing expected URL`,
      };
    return { assertion: { type: "url", expected } };
  }
  return {
    assertion: null,
    error: `${ctx.sheet} R${ctx.row}: assertion — unknown format (use visible:, text:, or url:)`,
  };
}

function normalizeAction(raw: string): ExcelAutomationAction | null {
  const a = raw.trim().toLowerCase();
  if (a === "click") return "click";
  if (a === "input" || a === "fill") return "input";
  if (a === "navigate" || a === "goto") return "navigate";
  return null;
}

function parseAutomationSlice(
  row: unknown[],
  map: TcColumnMap,
  ctx: { sheet: string; row: number },
  diagnostics: ExcelParseDiagnostics,
): ExcelAutomationSlice | null {
  const testId = cellStr(row, map.testId);
  const actionRaw = cellStr(row, map.action);
  const value = cellStr(row, map.value);
  const assertionRaw = cellStr(row, map.assertion);
  if (!actionRaw && !assertionRaw && !testId && !value) return null;

  const slice: ExcelAutomationSlice = {};
  if (testId) slice.testId = testId;
  if (value) slice.value = value;
  if (assertionRaw) slice.assertion = assertionRaw;
  if (actionRaw) {
    const act = normalizeAction(actionRaw);
    if (!act) {
      diagnostics.warnings.push(
        `${ctx.sheet} R${ctx.row}: unknown automation action "${actionRaw}"`,
      );
    } else {
      slice.action = act;
      if (act !== "navigate" && !testId) {
        diagnostics.errors.push(
          `${ctx.sheet} R${ctx.row}: automation ${act} requires test_id column value`,
        );
      }
      if (act === "navigate" && !value) {
        diagnostics.errors.push(
          `${ctx.sheet} R${ctx.row}: automation navigate requires value (URL)`,
        );
      }
    }
  }
  if (!slice.action && !slice.assertion && !slice.testId && !slice.value)
    return null;
  return slice;
}

function depthPathFromRow(row: unknown[], map: TcColumnMap): string[] {
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    const col = map.depth[d];
    const s = cellStr(row, col);
    if (s) out.push(s);
  }
  return out;
}

/**
 * 단일 시트 매트릭스 → 정책별 ExcelTestCase[].
 */
export function parseTcSheetMatrix(
  sheetName: string,
  matrix: unknown[][],
  diagnostics: ExcelParseDiagnostics,
): ExcelTestCase[] {
  if (matrix.length === 0) {
    diagnostics.warnings.push(`Sheet "${sheetName}": empty`);
    return [];
  }

  const headerIdx = findTcHeaderRowIndex(matrix);
  if (headerIdx < 0) {
    diagnostics.errors.push(
      `Sheet "${sheetName}": header row not found (need 정책 ID and 테스트케이스ID columns).`,
    );
    return [];
  }

  const headerRow = matrix[headerIdx]!;
  const map = buildTcColumnMap(headerRow);
  if (!map) {
    diagnostics.errors.push(`Sheet "${sheetName}": invalid header map`);
    return [];
  }

  let dataStart = headerIdx + 1;
  const nextRow = matrix[dataStart];
  if (Array.isArray(nextRow) && isBrowserSubheaderRow(nextRow)) dataStart += 1;

  const byPolicy = new Map<string, ExcelTcCaseRow[]>();

  for (let r = dataStart; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;

    const policyId = cellStr(row, map.policyId);
    const caseId = cellStr(row, map.caseId);
    if (!policyId && !caseId) continue;
    if (!policyId || !caseId) {
      diagnostics.warnings.push(
        `Sheet "${sheetName}" R${r + 1}: incomplete row (need policy id and testcase id)`,
      );
      continue;
    }

    const expected = cellStr(row, map.expected);
    const priority = cellStr(row, map.priority);
    const precondition = cellStr(row, map.precondition);
    const depthPath = depthPathFromRow(row, map);
    const chrome = cellStr(row, map.chrome);
    const edge = cellStr(row, map.edge);
    const defect = cellStr(row, map.defect);

    const notes =
      chrome || edge || defect
        ? { ...(chrome ? { chrome } : {}), ...(edge ? { edge } : {}), ...(defect ? { defect } : {}) }
        : undefined;

    const ctx = { sheet: sheetName, row: r + 1 };
    const automation = parseAutomationSlice(row, map, ctx, diagnostics);

    const tcRow: ExcelTcCaseRow = {
      caseId,
      ...(priority ? { priority } : {}),
      depthPath,
      ...(precondition ? { precondition } : {}),
      expected,
      ...(notes && Object.keys(notes).length > 0 ? { notes } : {}),
      ...(automation ? { automation } : {}),
    };

    const list = byPolicy.get(policyId) ?? [];
    list.push(tcRow);
    byPolicy.set(policyId, list);
  }

  const out: ExcelTestCase[] = [];
  for (const [policyId, cases] of byPolicy) {
    if (cases.length === 0) continue;
    const feature = `${sheetName}_${policyId}`;
    out.push({
      feature,
      sheetName,
      policyId,
      cases,
    });
  }

  if (out.length === 0)
    diagnostics.warnings.push(`Sheet "${sheetName}": no testcase rows parsed`);

  return out;
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const out: unknown[][] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: unknown[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      row.push(cell?.v ?? "");
    }
    out.push(row);
  }
  return out;
}

export function parseExcelBuffer(
  buffer: Buffer | Uint8Array,
  sheetNames?: string[],
): ExcelParseResult {
  const diagnostics: ExcelParseDiagnostics = { errors: [], warnings: [] };
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const names =
    sheetNames && sheetNames.length > 0
      ? sheetNames.filter((n) => wb.SheetNames.includes(n))
      : [...wb.SheetNames];

  if (sheetNames && sheetNames.length > 0) {
    for (const requested of sheetNames) {
      if (!wb.SheetNames.includes(requested))
        diagnostics.warnings.push(`Requested sheet not in workbook: "${requested}"`);
    }
  }

  const features: ExcelTestCase[] = [];
  for (const sheetName of names) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = sheetToMatrix(ws);
    const chunk = parseTcSheetMatrix(sheetName, matrix, diagnostics);
    features.push(...chunk);
  }

  return { features, diagnostics };
}
