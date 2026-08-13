import { parseTextToRealStep } from "./toScenarioSteps";
import { createStep, type Step } from "../../types";

/**
/**
 * Strips markdown table syntax (|---|---|), table header lines, and pipeline delimiters.
 */
function cleanTableFormatting(rawLine: string): string | null {
  let line = rawLine.trim();
  if (!line) return null;

  // 1. Skip Markdown table separator rows (e.g. |---|---| or |:---|:---|)
  if (/^\|?[\s\-:|]+\|?$/.test(line)) {
    return null;
  }

  // 2. If line is a markdown table row (contains '|'), parse cells
  if (line.includes("|")) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Skip table header rows consisting only of metadata keywords (e.g. | 순번 | 단계명 | 비고 |)
    const headerKeywords = ["순번", "id", "no", "단계", "단계명", "스텝", "action", "target", "value", "expected", "비고", "설명", "구분", "type", "precondition"];
    const isHeaderRow = cells.every((cell) => headerKeywords.includes(cell.toLowerCase()));
    if (isHeaderRow) {
      return null;
    }

    // Filter out pure index numbers or step sequence labels (e.g. "1", "2", "TC-01")
    const contentCells = cells.filter((cell) => {
      if (/^\d+$/.test(cell)) return false; // numeric index
      if (/^(tc|step)?[-_\s]*\d+$/i.test(cell)) return false; // TC-1, step 1
      return true;
    });

    if (contentCells.length > 0) {
      line = contentCells.join(" ");
    } else {
      line = cells.join(" ");
    }
  }

  // Strip any remaining pipe '|' characters and normalize spaces
  line = line.replace(/\|/g, " ").replace(/\s+/g, " ").trim();

  return line || null;
}

/**
 * Parses markdown (.md) formatted text into Playwright scenario steps.
 * Handles headings, bullet lists, numbered items, code blocks, tables, mermaid flowcharts, and plain text.
 */
export function parseMarkdownToSteps(mdText: string): Step[] {
  if (!mdText || !mdText.trim()) return [];

  const rawLines = mdText.split(/\r?\n/);
  const steps: Step[] = [];

  let inCodeBlock = false;

  for (let rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Code block toggle check
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip comments
    if (line.startsWith("//") || line.startsWith("<!--") || line.startsWith("/*")) {
      continue;
    }

    // Clean markdown table artifacts if present
    const cleanedTableLine = cleanTableFormatting(line);
    if (!cleanedTableLine) continue;
    line = cleanedTableLine;

    // Strip markdown formatting symbols (#, ##, ###, -, *, +, 1., 2., etc.)
    line = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[\*\-\+]\s+/, "")
      .replace(/^\d+[\.\)]\s+/, "")
      .trim();

    if (!line) continue;

    // Check Playwright code statements if inside code block or raw script
    // e.g. await page.goto('http://...');
    const pageGotoMatch = line.match(/await\s+page\.goto\(\s*['"]([^'"]+)['"]\s*\)/i);
    if (pageGotoMatch) {
      const step = createStep("goto");
      step.selectorValue = pageGotoMatch[1];
      step.label = `페이지 이동: ${pageGotoMatch[1]}`;
      steps.push(step);
      continue;
    }

    const pageClickMatch = line.match(/await\s+page\.(?:locator|getByText|getByRole|getByTestId|getByPlaceholder|getByLabel)\(([^)]+)\)\.click\(\)/i);
    if (pageClickMatch) {
      const step = createStep("click");
      step.selectorValue = pageClickMatch[1].replace(/['"]/g, "").trim();
      step.label = `클릭: ${step.selectorValue}`;
      steps.push(step);
      continue;
    }

    const pageFillMatch = line.match(/await\s+page\.(?:locator|getByText|getByRole|getByTestId|getByPlaceholder|getByLabel)\(([^)]+)\)\.fill\(\s*['"]([^'"]*)['"]\s*\)/i);
    if (pageFillMatch) {
      const step = createStep("fill");
      step.selectorValue = pageFillMatch[1].replace(/['"]/g, "").trim();
      step.inputValue = pageFillMatch[2];
      step.label = `입력: "${step.selectorValue}" 필드`;
      steps.push(step);
      continue;
    }

    const pageWaitMatch = line.match(/await\s+page\.waitForTimeout\(\s*(\d+)\s*\)/i);
    if (pageWaitMatch) {
      const ms = parseInt(pageWaitMatch[1], 10);
      const step = createStep("wait_ms");
      step.waitMs = ms;
      step.label = `${ms}ms 대기`;
      steps.push(step);
      continue;
    }

    // Default: Parse natural language or structured flow node text
    const parsedSteps = parseTextToRealStep(line);
    if (parsedSteps.length > 0) {
      steps.push(...parsedSteps);
    }
  }

  return steps;
}

import type { CustomNode, CustomEdge } from "./flowGraphAnalyzer";

/**
 * Converts generated scenario Steps into Flow Builder Canvas Nodes and Edges
 */
export function convertStepsToFlowNodesAndEdges(steps: Step[]): { nodes: CustomNode[]; edges: CustomEdge[] } {
  if (!steps || steps.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: CustomNode[] = [];
  const edges: CustomEdge[] = [];

  const startX = 250;
  let currentY = 30;
  const ySpacing = 100;

  steps.forEach((step, idx) => {
    const id = (idx + 1).toString();
    const isFirst = idx === 0;
    const isLast = idx === steps.length - 1;

    let nodeType: CustomNode["type"] = "default";
    if (isFirst) nodeType = "input";
    else if (isLast) nodeType = "output";
    else if (step.type === "assert_visible" || step.type === "assert_hidden") nodeType = "condition";

    const label = step.label || step.selectorValue || `${step.type} 스텝`;

    nodes.push({
      id,
      type: nodeType,
      label,
      x: startX,
      y: currentY,
    });

    if (idx > 0) {
      const prevId = idx.toString();
      edges.push({
        id: `e${prevId}-${id}`,
        source: prevId,
        target: id,
      });
    }

    currentY += ySpacing;
  });

  return { nodes, edges };
}

