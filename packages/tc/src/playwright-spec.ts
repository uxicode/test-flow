import { CONTROL_KIND, type ControlKind } from "./control-kind.js";
import type { LocatorStrategy, TestCase } from "./build-test-cases.js";

const HASHED_CSS = /[._][a-z][a-zA-Z0-9]*_[a-z0-9]{3,}_[a-zA-Z0-9]{2,}/u;

function escapeSingle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function isHashed(selector: string): boolean {
  return HASHED_CSS.test(selector);
}

function locatorExpr(selector: string, strategy: LocatorStrategy): string {
  switch (strategy) {
    case "testid":
    case "css":
      return `page.locator('${escapeSingle(selector)}')`;
    case "label":
      return `page.getByLabel('${escapeSingle(selector)}')`;
    case "placeholder":
      return `page.getByPlaceholder('${escapeSingle(selector)}')`;
    case "nearby-text":
      return `page.getByText('${escapeSingle(selector)}').locator('xpath=..').locator('input, select, textarea, [role="combobox"]').first()`;
    case "role+name": {
      const sep = selector.indexOf("|");
      const role = sep >= 0 ? selector.slice(0, sep) : selector;
      const name = sep >= 0 ? selector.slice(sep + 1) : "";
      return `page.getByRole('${escapeSingle(role)}', { name: '${escapeSingle(name)}' })`;
    }
    default: {
      const _exhaustive: never = strategy;
      return `page.locator('${escapeSingle(String(_exhaustive))}')`;
    }
  }
}

function fieldLocator(target: string, selector: string | undefined, strategy: LocatorStrategy | undefined, control?: ControlKind): string {
  const sel = selector?.trim();
  const resolved: LocatorStrategy = strategy ?? "css";
  if (sel && !(resolved === "css" && isHashed(sel))) {
    return locatorExpr(sel, resolved);
  }
  if (control === CONTROL_KIND.date || control === CONTROL_KIND.dateRange) {
    return `page.getByRole('button', { name: /${escapeSingle(target)}/ })`;
  }
  return `page.getByLabel('${escapeSingle(target)}')`;
}

function dateRangeSteps(varName: string, value: string): string[] {
  const parts = value.split(/[~,]/u).map((part) => part.trim()).filter(Boolean);
  const start = parts[0] ?? value;
  const end = parts[1] ?? parts[0] ?? value;
  const startIso = start.replace(/[./]/g, "-");
  const endIso = end.replace(/[./]/g, "-");
  return [
    `  await ${varName}.click();`,
    `  const dateDialog = page.getByRole('dialog');`,
    `  await clickMonthDay(dateDialog, '${escapeSingle(startIso)}');`,
    `  await clickMonthDay(dateDialog, '${escapeSingle(endIso)}');`,
    `  await expect(${varName}).toHaveText(/${escapeSingle(startIso.replace(/-/g, "[.\\-/]"))}\\s*~\\s*${escapeSingle(endIso.replace(/-/g, "[.\\-/]"))}/);`,
  ];
}

function fillStep(control: ControlKind | undefined, loc: string, value: string): string[] {
  const kind = control ?? CONTROL_KIND.text;
  switch (kind) {
    case CONTROL_KIND.text:
    case CONTROL_KIND.password:
    case CONTROL_KIND.textarea:
      return [`  await ${loc}.fill('${escapeSingle(value)}');`];
    case CONTROL_KIND.radio:
    case CONTROL_KIND.checkbox:
      return [`  await ${loc}.click();`];
    case CONTROL_KIND.file:
      return value ? [`  await ${loc}.setInputFiles('${escapeSingle(value)}');`] : [`  // 파일 경로가 비어 있습니다`];
    case CONTROL_KIND.select:
    case CONTROL_KIND.combobox:
      return [
        `  await ${loc}.click();`,
        `  await page.getByRole('option', { name: '${escapeSingle(value)}' }).click();`,
      ];
    case CONTROL_KIND.date:
    case CONTROL_KIND.dateRange:
      return [];
    default: {
      const _exhaustive: never = kind;
      return [`  await ${loc}.fill('${escapeSingle(String(_exhaustive))}');`];
    }
  }
}

export function playwrightSpecFileName(title: string): string {
  const slug = title
    .trim()
    .replace(/[^\w가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  return `${slug || "testflow"}.spec.ts`;
}

export function generatePlaywrightSpec(
  testCase: TestCase,
  options: { startUrl: string; values?: Record<string, string> } = { startUrl: "https://example.com" },
): string {
  const startUrl = options.startUrl && /^https?:\/\//u.test(options.startUrl) && options.startUrl !== "https://"
    ? options.startUrl
    : "https://example.com";
  const helper = [
    `async function clickMonthDay(dialog: Locator, iso: string): Promise<void> {`,
    `  const [year, month, day] = iso.split('-').map(Number);`,
    `  const clicked = await dialog.evaluate((root, payload) => {`,
    `    const titleRe = new RegExp(payload.year + '\\\\s*년\\\\s*' + payload.month + '\\\\s*월');`,
    `    const panels = Array.from(root.querySelectorAll('div, section, table'));`,
    `    const panel = panels.find((el) => {`,
    `      const text = el.textContent || '';`,
    `      const headers = text.match(/\\\\d{4}\\\\s*년\\\\s*\\\\d{1,2}\\\\s*월/g) || [];`,
    `      return titleRe.test(text) && headers.length === 1;`,
    `    });`,
    `    if (!panel) return false;`,
    `    const exact = panel.querySelector('[data-date="' + payload.iso + '"], [title="' + payload.iso + '"]');`,
    `    if (exact) { (exact as HTMLElement).click(); return true; }`,
    `    const buttons = Array.from(panel.querySelectorAll('button, [role="gridcell"]'));`,
    `    const target = buttons.find((btn, index) => {`,
    `      const n = Number((btn.textContent || '').trim());`,
    `      if (n !== payload.day) return false;`,
    `      if (btn.getAttribute('aria-disabled') === 'true') return false;`,
    `      if (/outside|disabled|other-month/.test(btn.className)) return false;`,
    `      if (index < 7 && n > 7) return false;`,
    `      if (index > 20 && n < 8) return false;`,
    `      return true;`,
    `    }) as HTMLElement | undefined;`,
    `    if (!target) return false;`,
    `    target.click();`,
    `    return true;`,
    `  }, { year, month, day, iso });`,
    `  if (!clicked) throw new Error(iso + ' 날짜 칸을 찾지 못했습니다.');`,
    `}`,
  ];

  const lines: string[] = [
    `import { test, expect, type Locator, type Page } from '@playwright/test';`,
    ``,
    `test('${escapeSingle(testCase.title)}', async ({ page }: { page: Page }) => {`,
    `  await page.goto('${escapeSingle(startUrl)}');`,
    ``,
  ];

  testCase.inputs.forEach((input, index) => {
    const value = options.values?.[input.target] ?? input.value;
    const loc = fieldLocator(input.target, input.selector, input.selectorStrategy, input.control);
    const varName = `field${index + 1}`;
    const hashedNote =
      input.selector && isHashed(input.selector)
        ? `  // 저장된 셀렉터 ${input.selector} 는 CSS 모듈 해시라 트리거로 쓰지 않는다.`
        : undefined;
    if (input.control === CONTROL_KIND.dateRange || input.control === CONTROL_KIND.date) {
      if (hashedNote) lines.push(hashedNote);
      lines.push(`  // [${input.control}] ${input.target} = ${value}`);
      lines.push(`  const ${varName} = ${loc};`);
      lines.push(...dateRangeSteps(varName, value));
      lines.push(``);
      return;
    }
    if (hashedNote) lines.push(hashedNote);
    lines.push(`  // [${input.control ?? "text"}] ${input.target} = ${value || "(비움)"}`);
    lines.push(...fillStep(input.control, loc, value));
    lines.push(``);
  });

  if (testCase.buttonName) {
    lines.push(`  await page.getByRole('button', { name: '${escapeSingle(testCase.buttonName)}' }).click();`);
  }
  if (testCase.expectedText.trim()) {
    const phrase = testCase.expectedText.split(/\n/u)[0]?.trim() ?? testCase.expectedText.trim();
    lines.push(`  await expect(page.getByText('${escapeSingle(phrase)}')).toBeVisible();`);
  }
  lines.push(`});`, ``, ...helper, ``);
  return lines.join("\n");
}
