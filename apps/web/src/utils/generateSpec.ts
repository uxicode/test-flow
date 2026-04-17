import type { SelectorStrategy, Step } from "../types";

/** `apps/api/src/specGenerator.ts`의 클라이언트 사이드 미러 — 라이브 스튜디오의
   실시간 코드 프리뷰가 서버 왕복 없이 동일한 Playwright 스크립트를 그려낸다. */

function selectorToCode(
  strategy: SelectorStrategy,
  value: string,
  role: string,
): string {
  switch (strategy) {
    case "text":
      return `page.getByText(${JSON.stringify(value)})`;
    case "role":
      return `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(value)} })`;
    case "label":
      return `page.getByLabel(${JSON.stringify(value)})`;
    case "placeholder":
      return `page.getByPlaceholder(${JSON.stringify(value)})`;
    case "testid":
      return `page.getByTestId(${JSON.stringify(value)})`;
    case "css":
    default:
      return `page.locator(${JSON.stringify(value)})`;
  }
}

export function stepToLine(step: Step): string {
  const strategy = step.selectorStrategy ?? "css";
  const selValue = step.selectorValue ?? "";
  const role = step.role ?? "button";
  const sel = selValue
    ? selectorToCode(strategy, selValue, role)
    : `page.locator("")`;

  switch (step.type) {
    case "goto":
      return `await page.goto(${JSON.stringify(selValue)});`;
    case "click":
      return `await ${sel}.click();`;
    case "fill":
      return `await ${sel}.fill(${JSON.stringify(step.inputValue ?? "")});`;
    case "check":
      return `await ${sel}.check();`;
    case "assert_visible":
      return `await expect.soft(${sel}).toBeVisible();`;
    case "assert_hidden":
      return `await expect.soft(${sel}).toBeHidden();`;
    case "assert_text":
      return `await expect.soft(${sel}).toHaveText(${JSON.stringify(step.inputValue ?? "")});`;
    case "wait_ms":
      return `await page.waitForTimeout(${step.waitMs ?? 1000});`;
    case "wait_for_selector":
      return `await ${sel}.waitFor({ state: "visible" });`;
    case "screenshot": {
      const label = step.label ? `${step.label}-` : "";
      return `await page.screenshot({ path: "/artifacts/test-results/${label}${step.id}.png", fullPage: true });`;
    }
    default:
      return "";
  }
}

export function generateSpec(steps: Step[]): string {
  const body = steps.map((s) => `  ${stepToLine(s)}`).filter((l) => l.trim());
  return [
    `import { expect, test } from "@playwright/test";`,
    ``,
    `test("scenario", async ({ page }) => {`,
    ...body,
    `});`,
    ``,
  ].join("\n");
}
