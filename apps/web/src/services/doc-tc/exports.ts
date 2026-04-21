import * as XLSX from "xlsx";
import type { GeneratedDocTestCase } from "./types";

const XLSX_HEADERS = [
  "ID",
  "Feature",
  "Title",
  "Priority",
  "Type",
  "Preconditions",
  "Steps",
  "Expected Results",
  "Requirement IDs",
] as const;

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "doc-tc";
}

function joinLines(values: string[]): string {
  return values.join("\n");
}

function testCaseToRow(tc: GeneratedDocTestCase): (string | number)[] {
  return [
    tc.id,
    tc.feature,
    tc.title,
    tc.priority,
    tc.type,
    joinLines(tc.preconditions),
    joinLines(tc.steps),
    joinLines(tc.expectedResults),
    tc.requirementIds.join(", "),
  ];
}

export function downloadXlsx(
  testCases: GeneratedDocTestCase[],
  baseName: string,
): void {
  const rows: (string | number)[][] = [Array.from(XLSX_HEADERS)];
  for (const tc of testCases) rows.push(testCaseToRow(tc));
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
    { wch: 8 },
    { wch: 10 },
    { wch: 40 },
    { wch: 60 },
    { wch: 40 },
    { wch: 30 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "TestCases");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `${sanitizeFileName(baseName)}.xlsx`);
}

export function downloadJson(
  testCases: GeneratedDocTestCase[],
  baseName: string,
): void {
  const blob = new Blob([JSON.stringify(testCases, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `${sanitizeFileName(baseName)}.json`);
}

export function downloadMarkdown(
  testCases: GeneratedDocTestCase[],
  baseName: string,
): void {
  const lines: string[] = [];
  lines.push(`# ${baseName} - 자동 생성 TC`);
  lines.push("");
  testCases.forEach((tc, idx) => {
    lines.push(`## ${idx + 1}. ${tc.title}`);
    lines.push("");
    lines.push(`- Feature: ${tc.feature}`);
    lines.push(`- Priority: ${tc.priority}`);
    lines.push(`- Type: ${tc.type}`);
    if (tc.objective) lines.push(`- 목적: ${tc.objective}`);
    if (tc.preconditions.length) {
      lines.push("", "### 사전 조건");
      for (const p of tc.preconditions) lines.push(`- ${p}`);
    }
    if (tc.steps.length) {
      lines.push("", "### 단계");
      tc.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (tc.expectedResults.length) {
      lines.push("", "### 기대 결과");
      for (const e of tc.expectedResults) lines.push(`- ${e}`);
    }
    if (tc.requirementIds.length) {
      lines.push("", `> 요구사항 ID: ${tc.requirementIds.join(", ")}`);
    }
    lines.push("", "---", "");
  });
  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  triggerDownload(blob, `${sanitizeFileName(baseName)}.md`);
}
