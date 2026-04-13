import type {
  ExcelAutomationSlice,
  ExcelTcCaseRow,
  ExcelTestCase,
} from "./excelTestCaseTypes.js";

const AUTO_ACTIONS = new Set(["click", "input", "navigate"]);

function isAutomationSlice(x: unknown): x is ExcelAutomationSlice {
  if (x === null || x === undefined) return false;
  if (typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.testId !== undefined && typeof o.testId !== "string") return false;
  if (o.action !== undefined && typeof o.action !== "string") return false;
  if (o.action !== undefined && !AUTO_ACTIONS.has(o.action as string))
    return false;
  if (o.value !== undefined && typeof o.value !== "string") return false;
  if (o.assertion !== undefined && typeof o.assertion !== "string") return false;
  return true;
}

function isTcCaseRow(x: unknown): x is ExcelTcCaseRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.caseId !== "string") return false;
  if (!Array.isArray(o.depthPath) || !o.depthPath.every((d) => typeof d === "string"))
    return false;
  if (typeof o.expected !== "string") return false;
  if (o.priority !== undefined && typeof o.priority !== "string") return false;
  if (o.precondition !== undefined && typeof o.precondition !== "string")
    return false;
  if (o.notes !== undefined) {
    if (typeof o.notes !== "object" || o.notes === null) return false;
    const n = o.notes as Record<string, unknown>;
    for (const k of ["chrome", "edge", "defect"]) {
      if (n[k] !== undefined && typeof n[k] !== "string") return false;
    }
  }
  if (o.automation != null && !isAutomationSlice(o.automation)) return false;
  return true;
}

function isExcelTestCase(x: unknown): x is ExcelTestCase {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.feature !== "string") return false;
  if (typeof o.sheetName !== "string") return false;
  if (typeof o.policyId !== "string") return false;
  if (!Array.isArray(o.cases) || !o.cases.every(isTcCaseRow)) return false;
  return true;
}

export function parseTestCasesFromJsonBody(raw: unknown): ExcelTestCase[] | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const list = body.testCases;
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: ExcelTestCase[] = [];
  for (const item of list) {
    if (!isExcelTestCase(item)) return null;
    out.push(item);
  }
  return out;
}

/** Validate `excelTestCases` array from JSON (e.g. POST /api/runs). Empty array is valid. */
export function parseExcelTestCasesArray(raw: unknown): ExcelTestCase[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExcelTestCase[] = [];
  for (const item of raw) {
    if (!isExcelTestCase(item)) return null;
    out.push(item);
  }
  return out;
}
