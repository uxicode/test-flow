import { CONTROL_KIND, type ControlKind } from "./control-kind.js";
import type { LocatorStrategy, TestCase } from "./build-test-cases.js";
import { clickMonthDayHelperLines } from "./click-calendar-day-script.js";

export {
  CLICK_CALENDAR_DAY_SOURCE,
  DATE_VALUE_MATCHES_SOURCE,
  clickMonthDayHelperLines,
  dateValueMatches,
  type DayClickPayload,
  type DayClickResult,
} from "./click-calendar-day-script.js";

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeSingle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** 날짜 트리거를 찾을 때 러너와 spec 이 같이 쓰는 이름 목록. */
export function dateTriggerNames(target: string): string[] {
  const core = target.replace(/(필터|입력|조건|선택)\s*$/u, "").trim();
  const labels = new Set<string>([target, core].filter(Boolean));
  if (/검사\s*일|등록\s*일|조회\s*기간/u.test(target)) {
    labels.add("등록일");
    labels.add("검사일");
    labels.add("조회 기간");
  }
  return [...labels];
}

export function dateTriggerNamePattern(target: string): string {
  return dateTriggerNames(target).map(escapeRegex).join("|");
}

/** 전략 + 셀렉터 → Playwright 코드. 패널 스니펫·spec·러너가 같은 문자열을 쓴다. */
export function playwrightLocatorExpr(strategy: LocatorStrategy, selector: string): string {
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

/** 사용자가 고른 날짜 셀렉터는 캘린더 컨테이너다. 받은 문자열 그대로 locator 에 넣는다. */
export function dateCalendarScopeExpr(selector: string): string {
  return playwrightLocatorExpr("css", selector);
}

export function dateTriggerLocatorExpr(target: string): string {
  const pattern = dateTriggerNamePattern(target);
  return `page.getByRole('button', { name: /${pattern}/ }).or(page.getByLabel(/${pattern}/))`;
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
  const helper = clickMonthDayHelperLines();

  const lines: string[] = [
    `import { test, expect, type Locator, type Page } from '@playwright/test';`,
    ``,
    `test('${escapeSingle(testCase.title)}', async ({ page }: { page: Page }) => {`,
    `  await page.goto('${escapeSingle(startUrl)}');`,
    ``,
  ];

  testCase.inputs.forEach((input, index) => {
    const value = options.values?.[input.target] ?? input.value;
    const varName = `field${index + 1}`;
    if (input.control === CONTROL_KIND.dateRange || input.control === CONTROL_KIND.date) {
      const parts = value.split(/[~,]/u).map((part) => part.trim()).filter(Boolean);
      const startIso = (parts[0] ?? value).replace(/[./]/g, "-");
      const endIso = (parts[1] ?? parts[0] ?? value).replace(/[./]/g, "-");
      const triggerExpr = dateTriggerLocatorExpr(input.target);
      lines.push(`  // [${input.control}] ${input.target} = ${value}`);
      lines.push(`  const ${varName} = ${triggerExpr};`);
      lines.push(`  await ${varName}.click();`);
      if (input.selector?.trim()) {
        const calendarExpr = dateCalendarScopeExpr(input.selector.trim());
        lines.push(`  const calendar${index + 1} = ${calendarExpr};`);
        lines.push(`  await expect(calendar${index + 1}).toBeVisible();`);
        lines.push(`  await clickMonthDay(calendar${index + 1}, '${escapeSingle(startIso)}');`);
        if (input.control === CONTROL_KIND.dateRange) {
          lines.push(`  await clickMonthDay(calendar${index + 1}, '${escapeSingle(endIso)}');`);
        }
      } else {
        lines.push(`  const calendar${index + 1} = page.getByRole('dialog');`);
        lines.push(`  await clickMonthDay(calendar${index + 1}, '${escapeSingle(startIso)}');`);
        if (input.control === CONTROL_KIND.dateRange) {
          lines.push(`  await clickMonthDay(calendar${index + 1}, '${escapeSingle(endIso)}');`);
        }
      }
      lines.push(`  await expect(${varName}).toHaveText(/${escapeSingle(startIso.replace(/-/g, "[.\\-/]"))}\\s*~\\s*${escapeSingle(endIso.replace(/-/g, "[.\\-/]"))}/);`);
      lines.push(``);
      return;
    }

    const strategy: LocatorStrategy = input.selectorStrategy ?? "css";
    const loc = input.selector?.trim()
      ? playwrightLocatorExpr(strategy, input.selector.trim())
      : `page.getByLabel('${escapeSingle(input.target)}')`;
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
