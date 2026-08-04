import type { SelectorStrategy, Step } from "./scenarioStore.js";

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

export function generateSpec(steps: Step[]): string {
  const lines: string[] = [];
  const total = steps.length;

  steps.forEach((step, idx) => {
    const strategy = (step.selectorStrategy ?? "css") as SelectorStrategy;
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
      case "click": {
        lines.push(`  const clickTarget_${idx + 1} = ${sel}.first();`);
        lines.push(`  if (await clickTarget_${idx + 1}.isVisible({ timeout: 3000 }).catch(() => false)) {`);
        lines.push(`    await clickTarget_${idx + 1}.click({ force: true, timeout: 5000 }).catch(() => {});`);
        lines.push(`  } else {`);
        lines.push(`    await clickTarget_${idx + 1}.click({ force: true, timeout: 2000 }).catch(() => {`);
        lines.push(`      console.log("요소가 화면에 나타나지 않아 클릭을 건너땁니다: " + ${JSON.stringify(label)});`);
        lines.push(`    });`);
        lines.push(`  }`);
        break;
      }
      case "fill": {
        lines.push(`  const fillTarget_${idx + 1} = ${sel};`);
        lines.push(`  if (await fillTarget_${idx + 1}.isVisible({ timeout: 3000 }).catch(() => false)) {`);
        lines.push(`    await fillTarget_${idx + 1}.fill(${JSON.stringify(step.inputValue ?? "")}).catch(() => {});`);
        lines.push(`  } else {`);
        lines.push(`    console.log("입력 필드를 찾지 못해 작성을 건너땁니다: " + ${JSON.stringify(label)});`);
        lines.push(`  }`);
        break;
      }
      case "check": {
        lines.push(`  const checkTarget_${idx + 1} = ${sel};`);
        lines.push(`  if (await checkTarget_${idx + 1}.isVisible({ timeout: 3000 }).catch(() => false)) {`);
        lines.push(`    await checkTarget_${idx + 1}.check().catch(() => {});`);
        lines.push(`  } else {`);
        lines.push(`    console.log("체크박스를 찾지 못해 선택을 건너땁니다: " + ${JSON.stringify(label)});`);
        lines.push(`  }`);
        break;
      }
      case "assert_visible":
        /* soft: 중간 검증 실패 시에도 이후 스텝·영상이 끝까지 이어지도록 */
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
        const shotLabel = step.label ? `${step.label}-` : "";
        lines.push(
          `  await page.screenshot({ path: "/artifacts/test-results/${shotLabel}${step.id}.png", fullPage: true });`,
        );
        break;
      }
      case "api_request": {
        const method = (step.inputValue || "GET").toLowerCase();
        const endpoint = step.selectorValue || "/api";
        const urlVar = `apiUrl_${idx + 1}`;
        const respVar = `apiResponse_${idx + 1}`;
        const bodyVar = `responseBody_${idx + 1}`;
        lines.push(`  // 1. Base URL 결합 및 ${step.inputValue || "GET"} 요청 전송`);
        lines.push(`  const ${urlVar} = ${JSON.stringify(endpoint)}.startsWith("http")`);
        lines.push(`    ? ${JSON.stringify(endpoint)}`);
        lines.push(`    : (page.url() && page.url() !== "about:blank" ? new URL(${JSON.stringify(endpoint)}, page.url()).toString() : "http://localhost:5174" + ${JSON.stringify(endpoint)});`);
        lines.push(`  const ${respVar} = await page.request.${method}(${urlVar}, {`);
        lines.push(`    headers: { 'Accept': 'application/json' }`);
        lines.push(`  });`);
        lines.push(`  // 2. HTTP 상태 코드 검증 (200 OK)`);
        lines.push(`  expect.soft(${respVar}.status()).toBe(200);`);
        lines.push(`  expect.soft(${respVar}.ok()).toBeTruthy();`);
        lines.push(`  // 3. 응답 Body JSON 데이터 구조 확인`);
        lines.push(`  const ${bodyVar} = await ${respVar}.json().catch(() => null);`);
        lines.push(`  if (${bodyVar}) console.log('API 응답 데이터:', ${bodyVar});`);
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
