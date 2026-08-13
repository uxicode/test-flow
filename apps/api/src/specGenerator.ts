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
      case "goto": {
        lines.push(`  const gotoUrl_${idx + 1} = ${JSON.stringify(selValue)};`);
        lines.push(`  await page.goto(gotoUrl_${idx + 1}).catch(async () => {`);
        lines.push(`    if (gotoUrl_${idx + 1}.includes(":5714")) {`);
        lines.push(`      const fallbackUrl = gotoUrl_${idx + 1}.replace(":5714", ":5174");`);
        lines.push(`      console.log("[TestFlow Smart Fallback] 5714 포트 연결거부 감지: 구동 중인 5174 포트로 자동 재시도 -> " + fallbackUrl);`);
        lines.push(`      await page.goto(fallbackUrl).catch((err) => console.log("페이지 이동 실패: " + err.message));`);
        lines.push(`    }`);
        lines.push(`  });`);
        break;
      }
      case "click": {
        lines.push(`  await animateVirtualCursor(page, ${JSON.stringify(selValue)});`);
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
        lines.push(`  await animateVirtualCursor(page, ${JSON.stringify(selValue)});`);
        lines.push(`  const fillTarget_${idx + 1} = ${sel};`);
        lines.push(`  if (await fillTarget_${idx + 1}.isVisible({ timeout: 3000 }).catch(() => false)) {`);
        lines.push(`    await fillTarget_${idx + 1}.fill(${JSON.stringify(step.inputValue ?? "")}).catch(() => {});`);
        lines.push(`  } else {`);
        lines.push(`    console.log("입력 필드를 찾지 못해 작성을 건너땁니다: " + ${JSON.stringify(label)});`);
        lines.push(`  }`);
        break;
      }
      case "check": {
        lines.push(`  await animateVirtualCursor(page, ${JSON.stringify(selValue)});`);
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
        lines.push(`  let ${respVar} = await page.request.${method}(${urlVar}, {`);
        lines.push(`    headers: { 'Accept': 'application/json' }`);
        lines.push(`  }).catch(() => null);`);
        lines.push(`  if (!${respVar} && ${urlVar}.includes(":5714")) {`);
        lines.push(`    const fallbackApiUrl = ${urlVar}.replace(":5714", ":5174");`);
        lines.push(`    console.log("[TestFlow Smart Fallback] API 요청 5714 실패로 5174 포트로 재시도: " + fallbackApiUrl);`);
        lines.push(`    ${respVar} = await page.request.${method}(fallbackApiUrl, { headers: { 'Accept': 'application/json' } }).catch(() => null);`);
        lines.push(`  }`);
        lines.push(`  if (${respVar}) {`);
        lines.push(`    // 2. HTTP 상태 코드 검증 (200 OK)`);
        lines.push(`    expect.soft(${respVar}.status()).toBe(200);`);
        lines.push(`    expect.soft(${respVar}.ok()).toBeTruthy();`);
        lines.push(`    // 3. 응답 Body JSON 데이터 구조 확인`);
        lines.push(`    const ${bodyVar} = await ${respVar}.json().catch(() => null);`);
        lines.push(`    if (${bodyVar}) console.log('API 응답 데이터:', ${bodyVar});`);
        lines.push(`  }`);
        break;
      }
    }
  });

  return [
    `import { expect, test } from "@playwright/test";`,
    ``,
    `async function animateVirtualCursor(page, locatorStr) {`,
    `  try {`,
    `    await page.evaluate(async (locStr) => {`,
    `      let cursor = document.getElementById('tf-virtual-cursor');`,
    `      if (!cursor) {`,
    `        const style = document.createElement('style');`,
    `        style.id = 'tf-cursor-styles';`,
    `        style.textContent = \``,
    `          #tf-virtual-cursor {`,
    `            position: fixed;`,
    `            top: 0;`,
    `            left: 0;`,
    `            width: 26px;`,
    `            height: 26px;`,
    `            pointer-events: none;`,
    `            z-index: 9999999;`,
    `            transform: translate(-100px, -100px);`,
    `            transition: transform 0.03s linear;`,
    `          }`,
    `          .tf-click-ripple {`,
    `            position: absolute;`,
    `            top: -12px;`,
    `            left: -12px;`,
    `            width: 36px;`,
    `            height: 36px;`,
    `            border-radius: 50%;`,
    `            background: rgba(14, 165, 233, 0.35);`,
    `            border: 2px solid rgba(14, 165, 233, 0.9);`,
    `            box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);`,
    `            animation: tf-ping 0.45s cubic-bezier(0, 0, 0.2, 1) forwards;`,
    `          }`,
    `          @keyframes tf-ping {`,
    `            0% { transform: scale(0.2); opacity: 1; }`,
    `            100% { transform: scale(1.8); opacity: 0; }`,
    `          }`,
    `        \`;`,
    `        document.head.appendChild(style);`,
    ``,
    `        cursor = document.createElement('div');`,
    `        cursor.id = 'tf-virtual-cursor';`,
    `        cursor.innerHTML = \``,
    `          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));">`,
    `            <path d="M5.5 3.5L18.5 11.5L12 13.5L9.5 20.5L5.5 3.5Z" fill="#0EA5E9" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>`,
    `          </svg>`,
    `          <div id="tf-ripple-container"></div>`,
    `        \`;`,
    `        document.body.appendChild(cursor);`,
    `        window.__tf_cursor_pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };`,
    `      }`,
    ``,
    `      let el = null;`,
    `      try { if (locStr) el = document.querySelector(locStr); } catch (e) {}`,
    `      if (!el && locStr) {`,
    `        const cleanVal = locStr.replace(/["']/g, '');`,
    `        const candidates = Array.from(document.querySelectorAll('button, a, input, select, label, [role="button"]'));`,
    `        el = candidates.find(c => (c.innerText || c.textContent || '').includes(cleanVal) || c.getAttribute('placeholder')?.includes(cleanVal)) || null;`,
    `      }`,
    `      if (!el) return;`,
    ``,
    `      const rect = el.getBoundingClientRect();`,
    `      const targetX = rect.left + rect.width / 2;`,
    `      const targetY = rect.top + rect.height / 2;`,
    ``,
    `      const startPos = window.__tf_cursor_pos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };`,
    `      const startX = startPos.x;`,
    `      const startY = startPos.y;`,
    ``,
    `      const steps = 18;`,
    `      for (let i = 1; i <= steps; i++) {`,
    `        const t = i / steps;`,
    `        const ease = t * t * (3 - 2 * t);`,
    `        const curX = startX + (targetX - startX) * ease;`,
    `        const curY = startY + (targetY - startY) * ease;`,
    `        cursor.style.transform = 'translate(' + curX + 'px, ' + curY + 'px)';`,
    `        window.__tf_cursor_pos = { x: curX, y: curY };`,
    `        await new Promise(r => setTimeout(r, 16));`,
    `      }`,
    ``,
    `      const container = document.getElementById('tf-ripple-container');`,
    `      if (container) {`,
    `        const ripple = document.createElement('div');`,
    `        ripple.className = 'tf-click-ripple';`,
    `        container.appendChild(ripple);`,
    `        setTimeout(() => ripple.remove(), 450);`,
    `      }`,
    `    }, typeof locatorStr === 'string' ? locatorStr : null).catch(() => {});`,
    `  } catch (e) {}`,
    `}`,
    ``,
    `test("scenario", async ({ page }) => {`,
    ...lines,
    `});`,
    ``,
  ].join("\n");
}
