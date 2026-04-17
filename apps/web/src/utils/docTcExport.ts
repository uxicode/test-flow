import * as XLSX from "xlsx";
import type { GeneratedDocTestCase } from "../types";

const MAX_CELL = 32000;

function clip(value: string): string {
  if (value.length <= MAX_CELL) return value;
  return `${value.slice(0, MAX_CELL - 3)}...`;
}

function safeBaseName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadGeneratedDocTcJson(
  items: GeneratedDocTestCase[],
  fileNameBase: string,
): void {
  const safe = safeBaseName(fileNameBase || "generated-doc-tc");
  downloadTextFile(JSON.stringify(items, null, 2), `${safe}.json`, "application/json");
}

export function generatedDocTcToMarkdown(
  items: GeneratedDocTestCase[],
  title: string,
): string {
  const lines: string[] = [`# ${title || "Generated Document TC"}`, ""];
  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push("");
    lines.push(`- Feature: ${item.feature}`);
    lines.push(`- Type: ${item.type ?? "positive"}`);
    lines.push(`- Priority: ${item.priority ?? "P2"}`);
    lines.push(`- Requirement IDs: ${item.requirementIds.join(", ") || "-"}`);
    if (item.objective) lines.push(`- Objective: ${item.objective}`);
    lines.push("");
    lines.push(`### Preconditions`);
    if (item.preconditions.length === 0) {
      lines.push(`- 없음`);
    } else {
      for (const pre of item.preconditions) lines.push(`- ${pre}`);
    }
    lines.push("");
    lines.push(`### Steps`);
    if (item.steps.length === 0) {
      lines.push(`1. 없음`);
    } else {
      item.steps.forEach((step, stepIndex) => lines.push(`${stepIndex + 1}. ${step}`));
    }
    lines.push("");
    lines.push(`### Expected Results`);
    if (item.expectedResults.length === 0) {
      lines.push(`- 없음`);
    } else {
      for (const expected of item.expectedResults) lines.push(`- ${expected}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadGeneratedDocTcMarkdown(
  items: GeneratedDocTestCase[],
  fileNameBase: string,
): void {
  const safe = safeBaseName(fileNameBase || "generated-doc-tc");
  const markdown = generatedDocTcToMarkdown(items, fileNameBase || "Generated Document TC");
  downloadTextFile(markdown, `${safe}.md`, "text/markdown");
}

export function downloadGeneratedDocTcExcel(
  items: GeneratedDocTestCase[],
  fileNameBase: string,
): void {
  const rows: (string | number)[][] = [
    [
      "TC ID",
      "제목",
      "Feature",
      "Type",
      "Priority",
      "Objective",
      "Requirement IDs",
      "Preconditions",
      "Steps",
      "Expected Results",
      "Review Status",
    ],
  ];

  for (const item of items) {
    rows.push([
      item.id,
      clip(item.title),
      clip(item.feature),
      item.type ?? "positive",
      item.priority ?? "P2",
      clip(item.objective ?? ""),
      clip(item.requirementIds.join(", ")),
      clip(item.preconditions.join("\n")),
      clip(item.steps.join("\n")),
      clip(item.expectedResults.join("\n")),
      item.reviewStatus ?? "draft",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 20 },
    { wch: 12 },
    { wch: 10 },
    { wch: 28 },
    { wch: 18 },
    { wch: 28 },
    { wch: 42 },
    { wch: 42 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "GeneratedTC");
  const safe = safeBaseName(fileNameBase || "generated-doc-tc");
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
