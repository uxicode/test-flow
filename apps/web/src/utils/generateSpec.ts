import { generatePlaywrightScript } from "./playwright-compiler";
import type { Step } from "../types";

export function stepToLine(step: Step): string {
  if (step.type === "goto") return `await page.goto(${JSON.stringify(step.selectorValue ?? "")});`;
  if (step.type === "wait_ms") return `await page.waitForTimeout(${step.waitMs ?? 1000});`;
  if (step.type === "api_request") {
    return `const resp = await page.request.${(step.inputValue || "GET").toLowerCase()}(${JSON.stringify(step.selectorValue || "/api")}); expect.soft(resp.status()).toBe(200);`;
  }
  const strategy = step.selectorStrategy ?? "css";
  const val = step.selectorValue ?? "";
  const role = step.role ?? "button";
  let sel = `page.locator(${JSON.stringify(val)})`;
  if (strategy === "text") sel = `page.getByText(${JSON.stringify(val)})`;
  else if (strategy === "role") sel = `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(val)} })`;

  if (step.type === "click") return `if (await ${sel}.isVisible({ timeout: 3000 }).catch(() => false)) await ${sel}.click().catch(() => {});`;
  if (step.type === "fill") return `if (await ${sel}.isVisible({ timeout: 3000 }).catch(() => false)) await ${sel}.fill(${JSON.stringify(step.inputValue ?? "")}).catch(() => {});`;
  if (step.type === "check") return `if (await ${sel}.isVisible({ timeout: 3000 }).catch(() => false)) await ${sel}.check().catch(() => {});`;
  if (step.type === "assert_visible") return `await expect.soft(${sel}).toBeVisible();`;
  if (step.type === "assert_hidden") return `await expect.soft(${sel}).toBeHidden();`;
  if (step.type === "assert_text") return `await expect.soft(${sel}).toHaveText(${JSON.stringify(step.inputValue ?? "")});`;
  return `await ${sel}.${step.type}();`;
}

/** `apps/api/src/specGenerator.ts` 및 `playwright-compiler.ts`의 클라이언트 사이드 미러 */
export function generateSpec(steps: Step[]): string {
  return generatePlaywrightScript(steps);
}
