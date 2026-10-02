import { CONTROL_KIND, type ControlKind, type TcInput } from "@testflow/tc";
import type { Locator, Page } from "playwright";
import { applyCustomDateRange, parseDateRangeValue } from "./date-picker.js";

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstVisible(candidates: Array<Locator | null | undefined>): Promise<Locator | null> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const count = await candidate.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

function labelPattern(target: string): RegExp {
  return new RegExp(escapeRegex(target), "i");
}

async function locateGroup(page: Page, target: string): Promise<Locator | null> {
  const pattern = labelPattern(target);
  return firstVisible([
    page.locator("fieldset", { has: page.getByText(pattern) }),
    page.locator("div", { has: page.getByText(pattern, { exact: false }) }).filter({
      has: page.locator('select, input[type="radio"], input[type="checkbox"], [role="combobox"], button'),
    }),
  ]);
}

async function applyTextField(
  page: Page,
  target: string,
  value: string,
): Promise<Locator> {
  const pattern = labelPattern(target);
  const found = await firstVisible([
    page.getByLabel(pattern),
    page.getByPlaceholder(pattern),
    page.getByRole("textbox", { name: pattern }),
    page.locator(`input[type="text"], input[type="search"], textarea`),
  ]);
  if (!found) throw new Error(`${target} 입력란을 찾지 못했습니다.`);
  await found.fill(value);
  return found;
}

export function isPageSizeField(target: string): boolean {
  return /개수|목록\s*표시|페이지당|페이지\s*크기|보기\s*개수|pageSize/iu.test(target);
}

function fieldLabels(target: string): string[] {
  const core = target.replace(/(필터|입력|조건|선택|설정|드롭다운)\s*$/u, "").trim();
  const labels = new Set<string>([target, core].filter(Boolean));
  if (/성별/u.test(target)) labels.add("성별");
  if (/검사\s*일|등록\s*일/u.test(target)) {
    labels.add("등록일");
    labels.add("검사일");
  }
  if (isPageSizeField(target)) {
    labels.add("페이지 당 표시 개수");
    labels.add("페이지당 표시 개수");
    labels.add("페이지 당");
    labels.add("페이지당");
    labels.add("목록 표시 개수");
    labels.add("표시 개수");
    labels.add("목록 개수");
    labels.add("개수");
    labels.add("보기");
  }
  return [...labels];
}

async function selectOptionOnNative(select: Locator, value: string): Promise<void> {
  await select.selectOption({ label: value }).catch(async () => {
    await select.selectOption({ value }).catch(async () => {
      await select.selectOption({ index: 0 });
    });
  });
}

async function locateNativeSelect(
  page: Page,
  target: string,
  value: string,
): Promise<Locator | null> {
  // value 기반으로 일치하는 option을 가진 select를 먼저 찾는다 (가장 정확한 방법)
  for (const variant of optionVariants(value)) {
    const byOptionValue = await firstVisible([
      page.locator("select").filter({ has: page.locator("option", { hasText: variant }) }),
    ]);
    if (byOptionValue) return byOptionValue;
  }

  // 라벨 기반으로 group 안에 있는 select를 찾는다 (group 없으면 null - 전체 fallback 금지)
  for (const label of fieldLabels(target)) {
    const pattern = labelPattern(label);
    const group = await locateGroup(page, label);
    if (group) {
      const select = await firstVisible([
        group.locator("select"),
        page.getByLabel(pattern).locator("select"),
      ]);
      if (select) return select;
    } else {
      // group이 없을 때는 라벨로 직접 연결된 select만 허용 (page.locator("select") 전체 fallback 금지)
      const labeled = await firstVisible([
        page.getByLabel(pattern).locator("select"),
      ]);
      if (labeled) return labeled;
    }
  }
  if (isPageSizeField(target)) {
    const select = await firstVisible([
      page.locator("select").filter({ has: page.locator("option", { hasText: /개씩|개/u }) }),
      page.locator("select").filter({ has: page.locator("option", { hasText: /\d+/u }) }),
    ]);
    if (select) return select;
  }
  return null;
}

async function applyRadio(page: Page, target: string, value: string): Promise<Locator> {
  const pattern = labelPattern(value);
  const group = await locateGroup(page, target);
  const scoped = group ?? page.locator("body");
  const radio = await firstVisible([
    scoped.getByRole("radio", { name: pattern }),
    scoped.locator(`label:has-text("${value}")`).locator('input[type="radio"]'),
    scoped.getByText(pattern, { exact: true }),
  ]);
  if (!radio) throw new Error(`${target}에서 "${value}" 선택지를 찾지 못했습니다.`);
  await radio.click();
  return radio;
}

async function applyCheckbox(page: Page, target: string, value: string): Promise<Locator> {
  const pattern = labelPattern(value || target);
  const box = await firstVisible([
    page.getByRole("checkbox", { name: pattern }),
    page.getByLabel(pattern),
  ]);
  if (!box) throw new Error(`${target} 체크박스를 찾지 못했습니다.`);
  const checked = await box.isChecked().catch(() => false);
  const shouldCheck = value !== "N" && value !== "false" && value !== "0";
  if (checked !== shouldCheck) await box.click();
  return box;
}

async function applyDate(page: Page, target: string, value: string): Promise<Locator> {
  try {
    return await applyCustomDateRange(page, target, value);
  } catch {
    /* single-day picker도 버튼+dialog일 수 있음 */
  }
  const pattern = labelPattern(target);
  const field = await firstVisible([
    page.getByLabel(pattern).locator('input[type="date"], input[type="datetime-local"]'),
    page.locator('input[type="date"], input[type="datetime-local"]'),
  ]);
  if (!field) throw new Error(`${target} 날짜 입력을 찾지 못했습니다.`);
  await field.fill(value || new Date().toISOString().slice(0, 10));
  return field;
}

async function applyDateRange(page: Page, target: string, value: string): Promise<Locator> {
  try {
    return await applyCustomDateRange(page, target, value);
  } catch (customError) {
    const parsed = parseDateRangeValue(value);
    const group = await locateGroup(page, target);
    const scoped = group ?? page.locator("body");
    const inputs = scoped.locator('input[type="date"], input[type="datetime-local"]');
    const count = await inputs.count();
    if (count >= 2 && parsed) {
      await inputs.nth(0).fill(isoFromParsed(parsed.start));
      await inputs.nth(1).fill(isoFromParsed(parsed.end));
      return inputs.nth(0);
    }
    const detail =
      customError instanceof Error ? customError.message : "날짜 피커 조작 실패";
    throw new Error(`${target} 기간 설정 실패: ${detail}`);
  }
}

function isoFromParsed(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function optionVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const set = new Set<string>([trimmed]);

  const countMatch = trimmed.match(/^(\d+)\s*(개씩\s*보기|개씩|개)?$/u);
  if (countMatch && countMatch[1]) {
    const num = countMatch[1];
    set.add(`${num}개씩 보기`);
    set.add(`${num}개씩`);
    set.add(`${num}개`);
    set.add(num);
  }

  if (trimmed.endsWith(" 보기")) {
    set.add(trimmed.replace(/\s*보기$/u, "").trim());
  } else {
    set.add(`${trimmed} 보기`);
  }

  return [...set];
}

async function pickListOption(page: Page, value: string): Promise<Locator | null> {
  const variants = optionVariants(value);
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    for (const variant of variants) {
      const pattern = new RegExp(escapeRegex(variant), "i");
      const found = await firstVisible([
        page.getByRole("listbox").getByRole("option", { name: pattern }),
        page.locator('[role="listbox"] [role="option"]', { hasText: pattern }),
        page.locator('[role="listbox"] button', { hasText: pattern }),
        page.locator('[data-select-popover-shell] button', { hasText: pattern }),
        page.locator('[data-select-popover-shell]').getByText(pattern, { exact: false }),
        page.getByRole("option", { name: pattern }),
        page.getByRole("menuitem", { name: pattern }),
        page.locator('[data-floating-ui-portal]').getByText(pattern, { exact: false }),
        page.locator('.dropdown-menu, .select-menu, [role="listbox"]').getByText(pattern, { exact: false }),
        page.getByText(pattern, { exact: true }),
      ]);
      if (found) return found;
    }
    await page.waitForTimeout(100);
  }
  return null;
}

async function interactCombobox(
  page: Page,
  trigger: Locator,
  target: string,
  value: string,
): Promise<Locator> {
  // 이미 해당 값이 드롭다운 트리거에 표시되어 있다면 다시 클릭하여 닫지 않고 즉시 반환
  const triggerText = await trigger.innerText().catch(() => "");
  const variants = optionVariants(value);
  if (variants.some((v) => triggerText.includes(v))) {
    return trigger;
  }

  const expanded = await trigger.getAttribute("aria-expanded").catch(() => null);
  if (expanded !== "true") {
    await trigger.click().catch(async () => {
      await trigger.locator("..").click();
    });
    await page.waitForTimeout(200);
  }

  let option = await pickListOption(page, value);
  // 만약 팝오버가 아직 열리지 않았다면 1회 추가 클릭 시도
  if (!option) {
    await trigger.click().catch(() => undefined);
    await page.waitForTimeout(200);
    option = await pickListOption(page, value);
  }

  if (!option) throw new Error(`${target}에서 "${value}" 항목을 찾지 못했습니다.`);
  await page.waitForTimeout(150);
  await option.click();
  await page.waitForTimeout(180);
  return trigger;
}

async function applyCombobox(page: Page, target: string, value: string): Promise<Locator> {
  for (const label of fieldLabels(target)) {
    const pattern = labelPattern(label);
    const group = (await locateGroup(page, label)) ?? (await locateGroup(page, target));
    const trigger = await firstVisible([
      group?.getByRole("combobox", { name: pattern }),
      group?.locator('[aria-haspopup="listbox"], [aria-haspopup="menu"]'),
      group?.locator('button[aria-haspopup="listbox"], button[aria-haspopup="menu"]'),
      group?.getByRole("button"),
      page.getByRole("combobox", { name: pattern }),
      page.locator(`button[aria-label="${label}"]`),
      page.locator(`button[aria-label*="${label}"]`),
      page.getByLabel(pattern).getByRole("button"),
      page.getByRole("button", { name: pattern }),
      page.locator("button", { hasText: pattern }),
    ]);
    if (trigger) {
      return await interactCombobox(page, trigger, target, value);
    }
  }

  if (isPageSizeField(target)) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const pageSizeTrigger = await firstVisible([
        page.locator('button, [role="combobox"], [aria-haspopup="listbox"]').filter({ hasText: /\d+\s*개씩/u }),
        page.locator('[aria-label*="표시 개수"], [aria-label*="페이지 당"]').locator('button, [role="combobox"]'),
        page.locator('button[aria-haspopup="listbox"], [role="combobox"]').filter({ hasText: /\d+/u }),
        page.getByRole("combobox", { name: /\d+\s*개/u }),
        page.getByRole("button", { name: /\d+\s*개/u }),
        page.locator('button, [role="combobox"]').filter({ hasText: /\d+\s*개/u }),
      ]);
      if (pageSizeTrigger) {
        return await interactCombobox(page, pageSizeTrigger, target, value);
      }
      await page.waitForTimeout(200);
    }
  }

  const valueNumberMatch = value.match(/\d+/);
  if (valueNumberMatch) {
    const numTrigger = await firstVisible([
      page.locator('button, [role="combobox"], [aria-haspopup="listbox"]').filter({ hasText: /\d+\s*개씩/u }),
      page.locator('button, [role="combobox"]').filter({ hasText: /\d+\s*개/u }),
    ]);
    if (numTrigger) {
      return await interactCombobox(page, numTrigger, target, value);
    }
  }

  throw new Error(`${target} 드롭다운 버튼을 찾지 못했습니다.`);
}

/** 네이티브 select가 있으면 그걸 쓰고, 없으면 디자인 드롭다운(combobox)으로 조작한다. */
async function applyChoiceField(page: Page, target: string, value: string): Promise<Locator> {
  const nativeSelect = await locateNativeSelect(page, target, value);
  if (nativeSelect) {
    await selectOptionOnNative(nativeSelect, value);
    return nativeSelect;
  }
  return applyCombobox(page, target, value);
}

export async function applyFieldValue(
  page: Page,
  input: TcInput,
  log: (message: string) => void,
  pointAt: (locator: Locator) => Promise<{ x: number; y: number }>,
): Promise<void> {
  const control: ControlKind = input.control ?? CONTROL_KIND.text;
  const value = input.value ?? "";
  let locator: Locator;

  switch (control) {
    case CONTROL_KIND.select:
      log(`${input.target}에서 "${value}" 선택 (HTML select 또는 드롭다운)`);
      locator = await applyChoiceField(page, input.target, value);
      break;
    case CONTROL_KIND.radio:
      log(`${input.target}에서 "${value}" 선택`);
      try {
        locator = await applyRadio(page, input.target, value);
      } catch {
        locator = await applyChoiceField(page, input.target, value);
      }
      break;
    case CONTROL_KIND.checkbox:
      log(`${input.target} 체크박스 ${value || "선택"} 적용`);
      locator = await applyCheckbox(page, input.target, value);
      break;
    case CONTROL_KIND.date:
      log(`${input.target} 날짜 ${value || "오늘"} 입력`);
      locator = await applyDate(page, input.target, value);
      break;
    case CONTROL_KIND.dateRange:
      log(`${input.target} 날짜 버튼을 열고 캘린더에서 기간 선택 (${value || "이번 달 1일~오늘"})`);
      locator = await applyDateRange(page, input.target, value);
      break;
    case CONTROL_KIND.combobox:
      log(`${input.target} 드롭다운에서 "${value}" 선택`);
      locator = await applyChoiceField(page, input.target, value);
      break;
    default:
      log(`${input.target} 입력란에 ${value ? "값을 넣습니다" : "비웁니다"}`);
      locator = await applyTextField(page, input.target, value);
      break;
  }

  await pointAt(locator);
}
