import { CONTROL_KIND, type ControlKind, type LocatorStrategy, type TcInput } from "@testflow/tc";
import type { Locator, Page } from "playwright";
import { applyCustomDateRange, parseDateRangeValue } from "./date-picker.js";

/**
 * CSS 모듈 해시 클래스 감지 패턴.
 * 예: `._root_du6a0_1` `._calendar_o7hka_89`
 * 이런 클래스는 빌드마다 바뀌므로 취약한 셀렉터다.
 */
export const HASHED_CSS_MODULE_PATTERN = /[._][a-z][a-zA-Z0-9]*_[a-z0-9]{3,}_[a-zA-Z0-9]{2,}/u;

export function isHashedCssModule(selector: string): boolean {
  return HASHED_CSS_MODULE_PATTERN.test(selector);
}

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

/** 보이는 후보 중 화면 넓이가 가장 작은(=가장 안쪽) 요소를 고른다. */
async function innermostVisible(candidate: Locator, limit = 40): Promise<Locator | null> {
  const count = Math.min(await candidate.count().catch(() => 0), limit);
  let best: Locator | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const item = candidate.nth(index);
    if (!(await item.isVisible().catch(() => false))) continue;
    const box = await item.boundingBox().catch(() => null);
    if (!box) continue;
    const area = box.width * box.height;
    if (area < bestArea) {
      best = item;
      bestArea = area;
    }
  }
  return best;
}

async function locateGroup(page: Page, target: string): Promise<Locator | null> {
  const pattern = labelPattern(target);
  const fieldset = await innermostVisible(
    page.locator("fieldset", { has: page.getByText(pattern) }),
  );
  if (fieldset) return fieldset;
  // 라벨과 컨트롤을 함께 가진 div 중 가장 안쪽 것 (페이지 전체 래퍼가 잡히지 않게)
  return innermostVisible(
    page.locator("div", { has: page.getByText(pattern, { exact: false }) }).filter({
      has: page.locator('select, input[type="radio"], input[type="checkbox"], [role="combobox"], button'),
    }),
  );
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

async function applyPasswordField(
  page: Page,
  target: string,
  value: string,
): Promise<Locator> {
  const pattern = labelPattern(target);
  const found = await firstVisible([
    page.getByLabel(pattern),
    page.getByPlaceholder(pattern),
    page.locator(`input[type="password"]`),
  ]);
  if (!found) throw new Error(`${target} 비밀번호 입력란을 찾지 못했습니다.`);
  await found.fill(value);
  return found;
}

async function applyTextareaField(
  page: Page,
  target: string,
  value: string,
): Promise<Locator> {
  const pattern = labelPattern(target);
  const found = await firstVisible([
    page.getByLabel(pattern),
    page.getByPlaceholder(pattern),
    page.getByRole("textbox", { name: pattern }),
    page.locator(`textarea`),
  ]);
  if (!found) throw new Error(`${target} 텍스트 영역을 찾지 못했습니다.`);
  await found.fill(value);
  return found;
}

async function applyFileField(
  page: Page,
  target: string,
  value: string,
): Promise<Locator> {
  const pattern = labelPattern(target);
  const found = await firstVisible([
    page.getByLabel(pattern),
    page.locator(`input[type="file"]`),
  ]);
  if (!found) throw new Error(`${target} 파일 첨부 입력을 찾지 못했습니다.`);
  if (value) await found.setInputFiles(value);
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
  const byLabel = await select.selectOption({ label: value }).then(() => true).catch(() => false);
  if (byLabel) return;
  const byValue = await select.selectOption({ value }).then(() => true).catch(() => false);
  if (byValue) return;
  throw new Error(`선택 목록에서 "${value}" 항목을 찾지 못했습니다.`);
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


/**
 * selectorStrategy 에 따라 적절한 Playwright Locator 를 반환한다.
 * CSS 전략은 page.locator(), label 전략은 page.getByLabel() 등을 사용한다.
 */
async function resolveLocatorByStrategy(
  page: Page,
  selector: string,
  strategy: LocatorStrategy,
  _target: string,
): Promise<Locator | null> {
  try {
    let loc: Locator;
    switch (strategy) {
      case "testid":
      case "css":
        loc = page.locator(selector).first();
        break;
      case "label":
        loc = page.getByLabel(selector).first();
        break;
      case "placeholder":
        loc = page.getByPlaceholder(selector).first();
        break;
      case "nearby-text":
        // 근처 텍스트: 해당 텍스트를 포함하는 부모 안의 첫 번째 대화형 요소
        loc = page
          .locator(`input, select, textarea, [role="combobox"]`)
          .filter({ has: page.locator(`..`, { hasText: selector }) })
          .first();
        break;
      case "role+name": {
        const sep = selector.indexOf("|");
        if (sep < 0) return null;
        const role = selector.slice(0, sep) as Parameters<Page["getByRole"]>[0];
        const name = selector.slice(sep + 1);
        loc = page.getByRole(role, { name }).first();
        break;
      }
      default: {
        const _exhaustive: never = strategy;
        void _exhaustive;
        return null;
      }
    }
    if (await loc.isVisible().catch(() => false)) return loc;
    return null;
  } catch {
    return null;
  }
}

async function applyUsingSelectorHint(
  page: Page,
  input: TcInput,
  value: string,
  containerSelector?: string,
): Promise<Locator | null> {
  const sel = input.selector?.trim();
  if (!sel) return null;

  const strategy: LocatorStrategy = input.selectorStrategy ?? "css";

  // date/dateRange: 셀렉터를 트리거 선택자로 사용
  const control: ControlKind = input.control ?? CONTROL_KIND.text;
  if (control === CONTROL_KIND.dateRange || control === CONTROL_KIND.date) {
    // hashed CSS module 경고: applyCustomDateRange 가 이 selector 를 트리거로 사용하므로
    // CSS 전략이면서 해시 클래스면 label-based fallback 을 시도한다
    if (strategy === "css" && isHashedCssModule(sel)) {
      return null; // 해시 클래스를 날짜 트리거로 쓰지 않는다
    }
    return applyCustomDateRange(page, input.target, value, sel);
  }

  // combobox/select: trigger selector 로 사용
  if (control === CONTROL_KIND.combobox || control === CONTROL_KIND.select) {
    const el = await resolveLocatorByStrategy(page, sel, strategy, input.target);
    if (!el) return null;
    return interactCombobox(page, el, input.target, value, containerSelector);
  }

  // 일반 요소: 전략별로 Locator 를 해석
  const el = await resolveLocatorByStrategy(page, sel, strategy, input.target);
  if (!el) return null;

  switch (control) {
    case CONTROL_KIND.text:
    case CONTROL_KIND.password:
    case CONTROL_KIND.textarea:
      await el.fill(value);
      return el;
    case CONTROL_KIND.radio:
    case CONTROL_KIND.checkbox:
      await el.click();
      return el;
    case CONTROL_KIND.file:
      if (value) await el.setInputFiles(value);
      return el;
    default: {
      const _exhaustive: never = control;
      void _exhaustive;
      return null;
    }
  }
}

async function applyDate(page: Page, target: string, value: string, triggerSelector?: string): Promise<Locator> {
  try {
    return await applyCustomDateRange(page, target, value, triggerSelector);
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

async function applyDateRange(
  page: Page,
  target: string,
  value: string,
  triggerSelector?: string,
): Promise<Locator> {
  try {
    return await applyCustomDateRange(page, target, value, triggerSelector);
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

  const countMatch = trimmed.match(/^(\d+)\s*(개씩\s*보기|개씩|개\s*보기|개)?$/u);
  if (countMatch && countMatch[1]) {
    const num = countMatch[1];
    set.add(`${num}개씩 보기`);
    set.add(`${num}개씩`);
    set.add(`${num}개 보기`);
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

/** 트리거의 표시 텍스트의 어느 한 줄이 기대 값(변형 포함)과 정확히 같은지 확인한다. ('완료'가 '미완료'에 걸리지 않게) */
export function textShowsValue(text: string, variants: string[]): boolean {
  const lines = text
    .split(/\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const wanted = variants.map((variant) => variant.replace(/\s+/gu, " ").trim());
  return lines.some((line) => wanted.includes(line));
}

export const DEFAULT_OPTION_CONTAINERS =
  '[role="listbox"], [role="menu"], [data-select-popover-shell], [data-floating-ui-portal], .dropdown-menu, .select-menu';

export function buildOptionContainers(customSelector?: string): string {
  const custom = customSelector?.trim();
  return custom ? `${custom}, ${DEFAULT_OPTION_CONTAINERS}` : DEFAULT_OPTION_CONTAINERS;
}

async function pickListOption(
  page: Page,
  value: string,
  containerSelector?: string,
): Promise<Locator | null> {
  const variants = optionVariants(value);
  const deadline = Date.now() + 3500;
  const containers = buildOptionContainers(containerSelector);
  while (Date.now() < deadline) {
    for (const variant of variants) {
      // 공백을 정리한 전체 일치(부분 일치 금지). 펼쳐진 목록·새 레이어 안에서만 찾는다.
      const exact = new RegExp(`^\\s*${escapeRegex(variant).replace(/\s+/gu, "\\s+")}\\s*$`, "u");
      const found = await firstVisible([
        page.getByRole("option", { name: exact }),
        page.getByRole("menuitem", { name: exact }),
        page.locator(containers).locator('[role="option"], button, li, [role="menuitem"]', { hasText: exact }),
        page.locator(containers).getByText(exact),
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
  containerSelector?: string,
): Promise<Locator> {
  // 이미 해당 값이 드롭다운 트리거에 표시되어 있다면 다시 클릭하여 닫지 않고 즉시 반환
  const triggerText = await trigger.innerText().catch(() => "");
  const variants = optionVariants(value);
  if (textShowsValue(triggerText, variants)) {
    return trigger;
  }

  const expanded = await trigger.getAttribute("aria-expanded").catch(() => null);
  if (expanded !== "true") {
    await trigger.click().catch(async () => {
      await trigger.locator("..").click();
    });
    await page.waitForTimeout(200);
  }

  let option = await pickListOption(page, value, containerSelector);
  // 만약 팝오버가 아직 열리지 않았다면 1회 추가 클릭 시도
  if (!option) {
    await trigger.click().catch(() => undefined);
    await page.waitForTimeout(200);
    option = await pickListOption(page, value, containerSelector);
  }

  if (!option) throw new Error(`${target}에서 "${value}" 항목을 찾지 못했습니다.`);
  await page.waitForTimeout(150);
  await option.click();
  await page.waitForTimeout(180);

  // 선택 후 트리거에 값이 실제로 표시되는지 확인한다. (잘못 눌렀으면 실패 처리)
  const verifyDeadline = Date.now() + 2000;
  let shown = false;
  while (Date.now() < verifyDeadline && !shown) {
    const text = await trigger.innerText().catch(() => "");
    shown = textShowsValue(text, variants);
    if (!shown) await page.waitForTimeout(150);
  }
  if (!shown) throw new Error(`${target}에서 "${value}" 선택이 화면에 반영되지 않았습니다.`);
  return trigger;
}

async function findPageSizeTrigger(page: Page, timeoutMs: number): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const trigger = await firstVisible([
      page.locator('button, [role="combobox"], [aria-haspopup="listbox"]').filter({ hasText: /\d+\s*개씩/u }),
      page.locator('[aria-label*="표시 개수"], [aria-label*="페이지 당"]').locator('button, [role="combobox"]'),
      page.locator('button, [role="combobox"]').filter({ hasText: /^\s*\d+\s*개/u }),
    ]);
    if (trigger) return trigger;
    await page.waitForTimeout(200);
  }
  return null;
}

/** 기획서에 설정된 options 중 하나가 현재 값으로 표시된 트리거를 찾는다. */
async function findTriggerByOptions(page: Page, options: string[]): Promise<Locator | null> {
  for (const option of options) {
    for (const variant of optionVariants(option)) {
      const pattern = new RegExp(`^\\s*${escapeRegex(variant)}\\s*$`, "u");
      const found = await firstVisible([
        page.locator('button, [role="combobox"], [aria-haspopup="listbox"]').filter({ hasText: pattern }),
      ]);
      if (found) return found;
    }
  }
  return null;
}

async function applyCombobox(
  page: Page,
  target: string,
  value: string,
  options: string[] = [],
  containerSelector?: string,
): Promise<Locator> {
  // 페이지 크기는 라벨 그룹 탐색이 엉뚱한 드롭다운(예: 성별)을 잡을 수 있어 먼저 찾는다.
  // 설정된 options를 우선 사용하고, 없을 때만 "N개" 표기 휴리스틱을 쓴다.
  if (isPageSizeField(target)) {
    const pageSizeTrigger =
      (options.length ? await findTriggerByOptions(page, options) : null) ??
      (await findPageSizeTrigger(page, 2500));
    if (pageSizeTrigger) return await interactCombobox(page, pageSizeTrigger, target, value, containerSelector);
  }

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
      return await interactCombobox(page, trigger, target, value, containerSelector);
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
        return await interactCombobox(page, pageSizeTrigger, target, value, containerSelector);
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
      return await interactCombobox(page, numTrigger, target, value, containerSelector);
    }
  }

  throw new Error(`${target} 드롭다운 버튼을 찾지 못했습니다.`);
}

/** 네이티브 select가 있으면 그걸 쓰고, 없으면 디자인 드롭다운(combobox)으로 조작한다. */
async function applyChoiceField(
  page: Page,
  target: string,
  value: string,
  options: string[] = [],
  containerSelector?: string,
): Promise<Locator> {
  const nativeSelect = await locateNativeSelect(page, target, value);
  if (nativeSelect) {
    await selectOptionOnNative(nativeSelect, value);
    return nativeSelect;
  }
  return applyCombobox(page, target, value, options, containerSelector);
}

export async function applyFieldValue(
  page: Page,
  input: TcInput,
  log: (message: string) => void,
  pointAt: (locator: Locator) => Promise<{ x: number; y: number }>,
  runOptions?: { optionContainerSelector?: string },
): Promise<void> {
  const control: ControlKind = input.control ?? CONTROL_KIND.text;
  const value = input.value ?? "";
  const containerSelector = runOptions?.optionContainerSelector;
  const triggerSelector = input.selector?.trim();
  let locator: Locator;

  const sel = input.selector?.trim();
  if (sel && isHashedCssModule(sel) && (input.selectorStrategy ?? "css") === "css") {
    log(`⚠ ${input.target}: 셀렉터가 CSS 모듈 해시 클래스(${sel.slice(0, 40)}…)입니다. 빌드마다 바뀌어 취약합니다.`);
  }

  const hinted = await applyUsingSelectorHint(page, input, value, containerSelector).catch(() => null);
  if (hinted) {
    log(`${input.target} · 셀렉터(${input.selectorStrategy ?? "css"}: ${sel})로 조작`);
    await pointAt(hinted);
    return;
  }

  switch (control) {
    case CONTROL_KIND.text:
      log(`${input.target} 입력란에 ${value ? "값을 넣습니다" : "비웁니다"}`);
      locator = await applyTextField(page, input.target, value);
      break;
    case CONTROL_KIND.password:
      log(`${input.target} 비밀번호 입력란에 값을 넣습니다`);
      locator = await applyPasswordField(page, input.target, value);
      break;
    case CONTROL_KIND.textarea:
      log(`${input.target} 텍스트 영역에 ${value ? "값을 넣습니다" : "비웁니다"}`);
      locator = await applyTextareaField(page, input.target, value);
      break;
    case CONTROL_KIND.select:
      log(`${input.target}에서 "${value}" 선택 (HTML select 또는 드롭다운)`);
      locator = await applyChoiceField(page, input.target, value, input.options, containerSelector);
      break;
    case CONTROL_KIND.radio:
      log(`${input.target}에서 "${value}" 라디오 선택`);
      locator = await applyRadio(page, input.target, value);
      break;
    case CONTROL_KIND.checkbox:
      log(`${input.target} 체크박스 ${value || "선택"} 적용`);
      locator = await applyCheckbox(page, input.target, value);
      break;
    case CONTROL_KIND.date:
      log(`${input.target} 날짜 ${value || "오늘"} 입력`);
      locator = await applyDate(page, input.target, value, triggerSelector);
      break;
    case CONTROL_KIND.dateRange:
      log(`${input.target} 날짜 버튼을 열고 캘린더에서 기간 선택 (${value || "이번 달 1일~오늘"})`);
      locator = await applyDateRange(page, input.target, value, triggerSelector);
      break;
    case CONTROL_KIND.combobox:
      log(`${input.target} 드롭다운에서 "${value}" 선택`);
      locator = await applyChoiceField(page, input.target, value, input.options, containerSelector);
      break;
    case CONTROL_KIND.file:
      log(`${input.target} 파일 첨부`);
      locator = await applyFileField(page, input.target, value);
      break;
    default: {
      const _exhaustive: never = control;
      throw new Error(`지원하지 않는 컨트롤 타입입니다: ${String(_exhaustive)}`);
    }
  }

  await pointAt(locator);
}
