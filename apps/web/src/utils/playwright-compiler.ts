import type { Step, SelectorStrategy } from "../types";

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

export function generatePlaywrightScript(steps: Step[]): string {
  const lines: string[] = [];
  const total = steps.length;

  steps.forEach((step, idx) => {
    const strategy = step.selectorStrategy ?? "css";
    const selValue = step.selectorValue ?? "";
    const role = step.role ?? "button";
    const sel = selValue
      ? selectorToCode(strategy, selValue, role)
      : `page.locator("")`;

    const stepNum = `[STEP ${idx + 1}/${total}]`;
    const label = step.label || `${step.type} ${selValue}`;
    lines.push(`  console.log(${JSON.stringify(`${stepNum} ${label}`)});`);

    switch (step.type) {
      case "goto":
        lines.push(`  await page.goto(${JSON.stringify(selValue)});`);
        break;
      case "click":
        lines.push(`  await ${sel}.click();`);
        break;
      case "fill":
        lines.push(`  await ${sel}.fill(${JSON.stringify(step.inputValue ?? "")});`);
        break;
      case "check":
        lines.push(`  await ${sel}.check();`);
        break;
      case "assert_visible":
        lines.push(`  await expect.soft(${sel}).toBeVisible();`);
        break;
      case "assert_hidden":
        lines.push(`  await expect.soft(${sel}).toBeHidden();`);
        break;
      case "assert_text":
        lines.push(
          `  await expect.soft(${sel}).toHaveText(${JSON.stringify(step.inputValue ?? "")});`,
        );
        break;
      case "wait_ms":
        lines.push(`  await page.waitForTimeout(${step.waitMs ?? 1000});`);
        break;
      case "wait_for_selector":
        lines.push(`  await ${sel}.waitFor({ state: "visible" });`);
        break;
      case "screenshot": {
        const screenshotLabel = step.label ? `${step.label}-` : "";
        lines.push(
          `  await page.screenshot({ path: "/artifacts/test-results/${screenshotLabel}${step.id}.png", fullPage: true });`,
        );
        break;
      }
    }
  });

  return [
    `import { expect, test } from "@playwright/test";`,
    ``,
    `test("scenario", async ({ page }) => {`,
    ...lines,
    `});`,
    ``,
  ].join("\n");
}
