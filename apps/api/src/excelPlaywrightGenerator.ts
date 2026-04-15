import { parseAssertionCell } from "./excelParser.js";
import type {
  ExcelAssertion,
  ExcelAutomationSlice,
  ExcelTcCaseRow,
  ExcelTestCase,
} from "./excelTestCaseTypes.js";

/** Remove characters unsafe for file names; keep Unicode letters (e.g. Korean). */
export function sanitizeSpecBaseName(feature: string): string {
  let s = feature
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = "feature";
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

function allocateSpecFileNames(features: string[]): string[] {
  const countByBase = new Map<string, number>();
  return features.map((feature) => {
    const base = sanitizeSpecBaseName(feature);
    const n = (countByBase.get(base) ?? 0) + 1;
    countByBase.set(base, n);
    const suffix = n > 1 ? `_${n}` : "";
    return `${base}${suffix}.spec.ts`;
  });
}

/** Escape for block comment body (no premature close). */
function safeBlockCommentBody(text: string, maxLen = 12000): string {
  return text.replace(/\*\//g, "* /").slice(0, maxLen);
}

function testTitleForCase(policyId: string, row: ExcelTcCaseRow): string {
  const depth = row.depthPath.length > 0 ? row.depthPath.join(" > ") : "(no depth)";
  const short = depth.length > 100 ? `${depth.slice(0, 97)}...` : depth;
  return `TC-${row.caseId} [${policyId}] ${short}`;
}

function assertionToCode(assertion: ExcelAssertion): string {
  switch (assertion.type) {
    case "visible":
      return `  await expect.soft(page.getByTestId(${JSON.stringify(assertion.target ?? "")})).toBeVisible();`;
    case "text":
      return `  await expect.soft(page.getByTestId(${JSON.stringify(assertion.target ?? "")})).toHaveText(${JSON.stringify(assertion.expected ?? "")});`;
    case "url":
      return `  await expect.soft(page).toHaveURL(${JSON.stringify(assertion.expected ?? "")});`;
  }
}

function automationCodeLines(
  featureLabel: string,
  row: ExcelTcCaseRow,
  auto: ExcelAutomationSlice,
): string[] {
  const lines: string[] = [];
  const ctx = { sheet: featureLabel, row: Number(row.caseId) || 0 };
  if (auto.action === "navigate" && auto.value) {
    lines.push(`  await page.goto(${JSON.stringify(auto.value)});`);
  } else if (auto.action === "click" && auto.testId) {
    lines.push(
      `  await page.getByTestId(${JSON.stringify(auto.testId)}).click();`,
    );
  } else if (auto.action === "input" && auto.testId) {
    lines.push(
      `  await page.getByTestId(${JSON.stringify(auto.testId)}).fill(${JSON.stringify(auto.value ?? "")});`,
    );
  }
  if (auto.assertion) {
    const { assertion, error } = parseAssertionCell(auto.assertion, ctx);
    if (error) lines.push(`  // assertion parse: ${error.replace(/\n/g, " ")}`);
    else if (assertion) lines.push(assertionToCode(assertion));
  }
  return lines;
}

function generateCaseBody(tc: ExcelTestCase, row: ExcelTcCaseRow): string {
  const parts: string[] = [];
  const doc = [
    row.depthPath.length ? `Depth: ${row.depthPath.join(" > ")}` : "",
    row.priority ? `Priority: ${row.priority}` : "",
    row.precondition ? `Precondition:\n${row.precondition}` : "",
    `Expected:\n${row.expected}`,
    row.notes?.chrome ? `Chrome: ${row.notes.chrome}` : "",
    row.notes?.edge ? `Edge: ${row.notes.edge}` : "",
    row.notes?.defect ? `Defect/notes: ${row.notes.defect}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  parts.push(`  /*`);
  parts.push(safeBlockCommentBody(doc));
  parts.push(`  */`);

  const autoLines = row.automation
    ? automationCodeLines(tc.feature, row, row.automation)
    : [];
  parts.push(...autoLines);

  if (autoLines.length === 0) {
    parts.push(
      `  // Add steps via Excel automation columns (test_id, action, value, assertion) or edit here.`,
    );
  }

  return parts.join("\n");
}

function generateDescribeOnly(tc: ExcelTestCase, baseUrl?: string): string {
  const hooks: string[] = [];
  if (baseUrl) {
    hooks.push(`  test.beforeEach(async ({ page }) => {`);
    hooks.push(`    await page.goto(${JSON.stringify(baseUrl)});`);
    hooks.push(`  });`);
  }
  const blocks = tc.cases.map((row) => {
    const title = testTitleForCase(tc.policyId, row);
    const body = `\n${generateCaseBody(tc, row)}\n`;
    return `  test(${JSON.stringify(title)}, async ({ page }) => {${body}  });`;
  });
  const inner = [...hooks, ...blocks].join("\n\n");
  return [
    `test.describe(${JSON.stringify(tc.feature)}, () => {`,
    inner,
    "});",
  ].join("\n");
}

export function generateSpecFileContent(tc: ExcelTestCase, baseUrl?: string): string {
  return [
    `import { test, expect } from "@playwright/test";`,
    "",
    generateDescribeOnly(tc, baseUrl),
    "",
  ].join("\n");
}

/** Single Playwright file: one import, multiple `test.describe` blocks (for TEST_DIR/scenario.spec.ts). */
export function generateMergedSpecFromTestCases(
  testCases: ExcelTestCase[],
  baseUrl?: string,
): string {
  if (testCases.length === 0) return "";
  const describes = testCases.map((tc) => generateDescribeOnly(tc, baseUrl));
  return [`import { test, expect } from "@playwright/test";`, "", ...describes, ""].join(
    "\n",
  );
}

export interface GeneratedSpecFile {
  fileName: string;
  content: string;
}

export function generateSpecFilesFromTestCases(
  testCases: ExcelTestCase[],
): GeneratedSpecFile[] {
  const names = allocateSpecFileNames(testCases.map((t) => t.feature));
  return testCases.map((tc, i) => ({
    fileName: names[i]!,
    content: generateSpecFileContent(tc),
  }));
}
