import * as XLSX from "xlsx";
import type { SmartTC } from "../types";

/** Parser-compatible header row (see apps/api/src/excelParser.ts `matchColumnLabel`). */
const HEADERS = [
  "정책 ID",
  "테스트케이스ID",
  "우선순위",
  "1 Depth",
  "2 Depth",
  "3 Depth",
  "4 Depth",
  "5 Depth",
  "6 Depth",
  "7 Depth",
  "사전조건",
  "기대결과",
] as const;

const MAX_CELL = 32000;

function clip(s: string): string {
  if (s.length <= MAX_CELL) return s;
  return `${s.slice(0, MAX_CELL - 3)}...`;
}

export function smartTcToAoA(items: SmartTC[], policyId: string): (string | number)[][] {
  const rows: (string | number)[][] = [Array.from(HEADERS)];
  for (const tc of items) {
    const d = ["", "", "", "", "", "", ""];
    d[0] = tc.action;
    d[1] = clip(tc.target);
    rows.push([
      policyId,
      String(tc.step),
      "",
      d[0]!,
      d[1]!,
      d[2]!,
      d[3]!,
      d[4]!,
      d[5]!,
      d[6]!,
      clip(tc.selector),
      clip(tc.description || tc.target || ""),
    ]);
  }
  return rows;
}

export function downloadSmartTcExcel(
  items: SmartTC[],
  options: { policyId: string; sheetName: string; fileName: string },
): void {
  const aoa = smartTcToAoA(items, options.policyId);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const sheet =
    options.sheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const safeBase = options.fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
  XLSX.writeFile(wb, `${safeBase || "smart-tc"}.xlsx`);
}

export function isSmartTCArray(raw: unknown): raw is SmartTC[] {
  if (!Array.isArray(raw)) return false;
  const actions = new Set([
    "navigate",
    "click",
    "fill",
    "check",
    "assert",
    "wait",
    "screenshot",
  ]);
  for (const x of raw) {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (typeof o.step !== "number") return false;
    if (typeof o.action !== "string" || !actions.has(o.action)) return false;
    if (typeof o.target !== "string") return false;
    if (typeof o.description !== "string") return false;
    if (typeof o.selector !== "string") return false;
  }
  return true;
}
