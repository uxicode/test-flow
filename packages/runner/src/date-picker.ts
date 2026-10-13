import { dateTriggerNames } from "@testflow/tc/playwright-spec";
import type { Locator, Page } from "playwright";
import { CLICK_CALENDAR_DAY_SOURCE } from "./date-picker-day-script.js";

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(target: string): RegExp {
  return new RegExp(escapeRegex(target), "i");
}

async function firstVisible(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    const count = await candidate.count();
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

/** 2026.10.01, 2026-10-01, 2026/10/01 등 */
export function parseSingleDate(raw: string): ParsedDate | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/u);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function parseDateRangeValue(value: string): { start: ParsedDate; end: ParsedDate } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[~,]/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseSingleDate(parts[0] ?? "");
    const end = parseSingleDate(parts[1] ?? "");
    if (start && end) return { start, end };
  }
  const single = parseSingleDate(trimmed);
  if (single) return { start: single, end: single };
  return null;
}

export function defaultDateRangeValue(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${format(start)},${format(now)}`;
}

export async function locateDatePickerTrigger(
  page: Page,
  target: string,
): Promise<Locator | null> {
  for (const label of dateTriggerNames(target)) {
    const pattern = labelPattern(label);
    const found = await firstVisible([
      page.getByRole("button", { name: pattern }),
      page.getByRole("textbox", { name: pattern }),
      page.getByLabel(pattern),
      page.locator(`button[aria-label="${label}"]`),
      page.locator(`button[aria-label*="${label}"]`),
      page.locator('button[aria-haspopup="dialog"]', { has: page.getByText(pattern) }),
      page.locator("button, input, [role='textbox']", { has: page.locator("span", { hasText: /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/u }) }),
    ]);
    if (found) return found;
  }
  return null;
}

async function openPickerDialog(page: Page, trigger: Locator): Promise<Locator> {
  const expanded = await trigger.getAttribute("aria-expanded");
  if (expanded !== "true") await trigger.click();
  const controls = await trigger.getAttribute("aria-controls");
  const dialog = await firstVisible([
    controls ? page.locator(`#${controls}`) : page.locator('[role="dialog"]'),
    page.locator('[role="dialog"]'),
    page.locator('[data-floating-ui-portal] [role="grid"]'),
    page.locator('[class*="calendar"], [class*="Calendar"]'),
  ]);
  if (!dialog) throw new Error("날짜 선택 팝업을 열지 못했습니다.");
  await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  return dialog;
}

export function isoDateKey(date: ParsedDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function sameDate(a: ParsedDate, b: ParsedDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function displayedRangeMatches(
  text: string,
  range: { start: ParsedDate; end: ParsedDate },
): boolean {
  const parsed = parseDateRangeValue(text);
  if (!parsed) return false;
  return sameDate(parsed.start, range.start) && sameDate(parsed.end, range.end);
}

type DayClickPayload = { year: number; month: number; day: number; key: string; doClick: boolean };

async function clickCalendarDay(scope: Locator, date: ParsedDate, doClick: boolean): Promise<boolean> {
  const payload: DayClickPayload = {
    year: date.year,
    month: date.month,
    day: date.day,
    key: isoDateKey(date),
    doClick,
  };
  const clicker = new Function("el", "payload", `return (${CLICK_CALENDAR_DAY_SOURCE})(el, payload);`) as (
    el: Element,
    arg: DayClickPayload,
  ) => boolean;
  return scope.evaluate(clicker, payload).catch(() => false);
}

async function shownMonthRange(scope: Locator): Promise<{ first: number; last: number } | null> {
  const text = await scope.evaluate((el) => (el as HTMLElement).innerText ?? "").catch(() => "");
  const matches = [...text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월/gu)];
  if (!matches.length) return null;
  const idxs = matches.map((match) => Number(match[1]) * 12 + Number(match[2]));
  return { first: Math.min(...idxs), last: Math.max(...idxs) };
}

/**
 * 날짜가 보이는 달이 될 때까지 앞/뒤로 이동한다.
 * 최대 14번 시도한다. 이동 버튼이 없으면 바로 멈춘다.
 */
async function ensureDayVisible(scope: Locator, date: ParsedDate): Promise<void> {
  const target = date.year * 12 + date.month;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    if (await clickCalendarDay(scope, date, false)) return;

    const shown = await shownMonthRange(scope);
    if (shown && target >= shown.first && target <= shown.last) break;
    const goBack = shown !== null && target < shown.first;
    const nav = await firstVisible(
      goBack
        ? [
            scope.getByRole("button", { name: /이전|prev|‹|</iu }),
            scope.locator('button[aria-label*="이전"], button[aria-label*="Prev"]'),
          ]
        : [
            scope.getByRole("button", { name: /다음|next|›|>/iu }),
            scope.locator('button[aria-label*="다음"], button[aria-label*="Next"]'),
          ],
    );
    if (!nav) break;
    await nav.click();
    await scope.page().waitForTimeout(150);
  }
}

async function pickDay(scope: Locator, date: ParsedDate): Promise<void> {
  await ensureDayVisible(scope, date);
  if (await clickCalendarDay(scope, date, true)) return;
  throw new Error(`${isoDateKey(date)} 날짜 칸을 찾지 못했습니다.`);
}

async function locateTriggerBySelector(page: Page, selector: string): Promise<Locator | null> {
  const trimmed = selector.trim();
  if (!trimmed) return null;
  const candidate = page.locator(trimmed).first();
  if (await candidate.count().catch(() => 0)) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

/** 사용자가 고른 캘린더 셀렉터를 찾지 못했을 때. dialog 등으로 넘기지 않는다. */
export class CalendarScopeError extends Error {
  readonly selector: string;
  constructor(message: string, selector: string) {
    super(message);
    this.name = "CalendarScopeError";
    this.selector = selector;
  }
}

export async function locateCalendarContainer(page: Page, selector: string): Promise<Locator> {
  const trimmed = selector.trim();
  const scope = page.locator(trimmed).first();
  const count = await scope.count().catch(() => 0);
  if (count === 0) {
    throw new CalendarScopeError(`캘린더 컨테이너를 찾지 못했습니다: ${trimmed}`, trimmed);
  }
  try {
    await scope.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    throw new CalendarScopeError(`캘린더 컨테이너가 보이지 않습니다: ${trimmed}`, trimmed);
  }
  return scope;
}

export interface ApplyDateRangeOptions {
  /** 사용자가 고른 캘린더 컨테이너. 받은 셀렉터를 그대로 사용한다. */
  containerSelector?: string;
  triggerSelector?: string;
}

function normalizeDateRangeOptions(options?: string | ApplyDateRangeOptions): ApplyDateRangeOptions {
  if (typeof options === "string") return { containerSelector: options };
  return options ?? {};
}

/** 캘린더를 조작한 뒤 트리거 값이 요청 범위와 다를 때. 다른 입력 방식으로 넘기지 않는다. */
export class DateRangeNotAppliedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateRangeNotAppliedError";
  }
}

/**
 * 트리거에 표시된 텍스트가 요청한 날짜 범위를 포함하는지 검증한다.
 * 실패하면 명확한 에러를 던진다 (무음 통과 금지).
 */
async function verifySelectedRange(
  readText: () => Promise<string>,
  range: { start: ParsedDate; end: ParsedDate },
): Promise<void> {
  // 날짜를 고르면 트리거 버튼의 접근 가능 이름이 바뀐다.
  // 이름 기반 로케이터를 다시 조회하지 않고, 미리 잡아 둔 요소에서 텍스트를 읽는다.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const text = await readText().catch(() => "");
  const startKey = isoDateKey(range.start);
  const endKey = isoDateKey(range.end);
  if (displayedRangeMatches(text, range)) return;

  const parsed = parseDateRangeValue(text);
  const actual = parsed
    ? `${isoDateKey(parsed.start)} ~ ${isoDateKey(parsed.end)}`
    : text.trim() || "(빈 값)";
  throw new DateRangeNotAppliedError(
    `날짜 범위가 요청과 정확히 일치하지 않습니다.\n` +
      `  요청: ${startKey} ~ ${endKey}\n` +
      `  트리거에 표시된 값: "${text.trim() || "(빈 값)"}"\n` +
      `  해석된 범위: ${actual}`,
  );
}

export async function applyCustomDateRange(
  page: Page,
  target: string,
  value: string,
  options?: string | ApplyDateRangeOptions,
): Promise<Locator> {
  const range =
    parseDateRangeValue(value) ??
    parseDateRangeValue(defaultDateRangeValue());
  if (!range) throw new Error(`${target} 기간 값을 해석하지 못했습니다.`);
  const opts = normalizeDateRangeOptions(options);

  const trigger =
    (opts.triggerSelector ? await locateTriggerBySelector(page, opts.triggerSelector) : null) ??
    (await locateDatePickerTrigger(page, target));
  if (!trigger) throw new Error(`${target} 날짜 선택 버튼을 찾지 못했습니다.`);
  const triggerHandle = await trigger.elementHandle();
  const readTriggerText = async () =>
    triggerHandle
      ? triggerHandle.evaluate((el) => (el as HTMLElement).innerText || (el as HTMLInputElement).value || "")
      : "";

  const expanded = await trigger.getAttribute("aria-expanded");
  if (expanded !== "true") await trigger.click();

  const scope = opts.containerSelector?.trim()
    ? await locateCalendarContainer(page, opts.containerSelector.trim())
    : await openPickerDialog(page, trigger);

  await pickDay(scope, range.start);
  await page.waitForTimeout(300);
  await pickDay(scope, range.end);

  const apply = await firstVisible([
    scope.getByRole("button", { name: /^(적용|확인|선택|apply|ok)$/iu }),
  ]);
  if (apply) await apply.click();

  await verifySelectedRange(readTriggerText, range);

  return trigger;
}
