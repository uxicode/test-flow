import type { Locator, Page } from "playwright";

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

function triggerLabels(target: string): string[] {
  const core = target.replace(/(필터|입력|조건|선택)\s*$/u, "").trim();
  const labels = new Set<string>([target, core].filter(Boolean));
  if (/검사\s*일|등록\s*일|조회\s*기간/u.test(target)) {
    labels.add("등록일");
    labels.add("검사일");
    labels.add("조회 기간");
  }
  return [...labels];
}

export async function locateDatePickerTrigger(
  page: Page,
  target: string,
): Promise<Locator | null> {
  for (const label of triggerLabels(target)) {
    const pattern = labelPattern(label);
    const found = await firstVisible([
      page.getByRole("button", { name: pattern }),
      page.locator(`button[aria-label="${label}"]`),
      page.locator(`button[aria-label*="${label}"]`),
      page.locator('button[aria-haspopup="dialog"]', { has: page.getByText(pattern) }),
      page.locator("button", { has: page.locator("span", { hasText: /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/u }) }),
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

function monthVariants(month: number): string[] {
  return [String(month), String(month).padStart(2, "0")];
}

async function clickCalendarDay(
  scope: Locator,
  date: ParsedDate,
): Promise<Locator | null> {
  const key = isoDateKey(date);
  const dayText = String(date.day);
  const monthLabels = monthVariants(date.month);
  const ariaDayCandidates: Locator[] = [];
  for (const monthLabel of monthLabels) {
    ariaDayCandidates.push(
      scope.locator(
        `[data-date="${key}"], button[data-day="${key}"], [aria-label*="${date.year}"][aria-label*="${monthLabel}"][aria-label*="${dayText}일"], [aria-label*="${date.year}"][aria-label*="${monthLabel}"][aria-label*=" ${dayText}"]`,
      ),
    );
  }

  // 두 달이 동시에 보일 때 '13'이 두 번 나오지 않게, 해당 월 제목을 가진 패널 안에서만 숫자 버튼을 찾는다.
  const monthTitle = new RegExp(`${date.year}\\s*년\\s*${date.month}\\s*월|${date.year}[^\\d]{0,6}${String(date.month).padStart(2, "0")}`, "u");
  const panel = scope.locator("div, section, table").filter({ hasText: monthTitle }).last();
  const panelCount = await panel.count().catch(() => 0);

  const candidates: Locator[] = [
    scope.locator(`[data-date="${key}"]`),
    scope.locator(`button[data-day="${key}"]`),
    ...ariaDayCandidates,
    ...(panelCount > 0
      ? [
          panel.locator(`[data-date="${key}"]`),
          panel.locator("button, td, [role='gridcell']", { hasText: new RegExp(`^\\s*${dayText}\\s*$`, "u") }),
        ]
      : []),
    scope.getByRole("gridcell", { name: new RegExp(`^\\s*${dayText}\\s*$`, "u") }),
  ];
  return firstVisible(candidates);
}

async function shownMonthIndex(scope: Locator): Promise<number | null> {
  const text = await scope.evaluate((el) => (el as HTMLElement).innerText ?? "").catch(() => "");
  const match = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/u) ?? text.match(/(\d{4})[^\d]{1,6}(\d{1,2})/u);
  if (!match?.[1] || !match[2]) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

/**
 * 날짜가 보이는 달이 될 때까지 앞/뒤로 이동한다.
 * 최대 14번 시도한다. 이동 버튼이 없으면 바로 멈춘다.
 */
async function ensureDayVisible(scope: Locator, date: ParsedDate): Promise<void> {
  const target = date.year * 12 + date.month;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const day = await clickCalendarDay(scope, date);
    if (day) return;

    const shown = await shownMonthIndex(scope);
    const goBack = shown !== null && shown > target;
    const nav = await firstVisible(
      goBack
        ? [
            scope.getByRole("button", { name: /이전|prev/iu }),
            scope.locator('button[aria-label*="이전"], button[aria-label*="Prev"]'),
          ]
        : [
            scope.getByRole("button", { name: /다음|next/iu }),
            scope.locator('button[aria-label*="다음"], button[aria-label*="Next"]'),
          ],
    );
    if (!nav) break;
    await nav.click();
    await scope.page().waitForTimeout(150);
  }
}

async function pickDay(scope: Locator, date: ParsedDate): Promise<Locator> {
  await ensureDayVisible(scope, date);
  const day = await clickCalendarDay(scope, date);
  if (!day) throw new Error(`${isoDateKey(date)} 날짜 칸을 찾지 못했습니다.`);
  await day.click();
  return day;
}

/** CSS 모듈 해시 클래스 감지 패턴 (날짜 트리거로 사용하지 않는다). */
const HASHED_CSS_PATTERN = /[._][a-z][a-zA-Z0-9]*_[a-z0-9]{3,}_[a-zA-Z0-9]{2,}/u;

async function locateTriggerBySelector(page: Page, selector: string): Promise<Locator | null> {
  const trimmed = selector.trim();
  if (!trimmed) return null;
  // 해시 CSS 모듈 클래스는 날짜 트리거로 쓰지 않는다 — 라벨 기반 fallback 을 쓴다
  if (HASHED_CSS_PATTERN.test(trimmed)) return null;
  const candidate = page.locator(trimmed).first();
  if (await candidate.count().catch(() => 0)) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
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
  // 날짜 텍스트 정규화: 구분자를 통일
  const normalized = text.replace(/[.\-/]/gu, "-").replace(/\s+/gu, " ");

  function showsDate(d: ParsedDate): boolean {
    const y = String(d.year);
    const months = [String(d.month), String(d.month).padStart(2, "0")];
    const days = [String(d.day), String(d.day).padStart(2, "0")];
    return months.some((month) =>
      days.some((day) => new RegExp(`(?<!\\d)${y}-${month}-${day}(?!\\d)`, "u").test(normalized)),
    );
  }

  const hasStart = showsDate(range.start);
  const hasEnd = showsDate(range.end);

  if (!hasStart || !hasEnd) {
    const startKey = isoDateKey(range.start);
    const endKey = isoDateKey(range.end);
    throw new DateRangeNotAppliedError(
      `날짜 범위가 올바르게 설정되지 않았습니다.\n` +
        `  요청: ${startKey} ~ ${endKey}\n` +
        `  트리거에 표시된 값: "${text.trim() || "(빈 값)"}"\n` +
        `  시작일 확인: ${hasStart ? "✓" : "✗"}  종료일 확인: ${hasEnd ? "✓" : "✗"}`,
    );
  }
}

export async function applyCustomDateRange(
  page: Page,
  target: string,
  value: string,
  triggerSelector?: string,
): Promise<Locator> {
  const range =
    parseDateRangeValue(value) ??
    parseDateRangeValue(defaultDateRangeValue());
  if (!range) throw new Error(`${target} 기간 값을 해석하지 못했습니다.`);

  const trigger =
    (triggerSelector ? await locateTriggerBySelector(page, triggerSelector) : null) ??
    (await locateDatePickerTrigger(page, target));
  if (!trigger) throw new Error(`${target} 날짜 선택 버튼을 찾지 못했습니다.`);
  const triggerHandle = await trigger.elementHandle();
  const readTriggerText = async () =>
    triggerHandle
      ? triggerHandle.evaluate((el) => (el as HTMLElement).innerText || (el as HTMLInputElement).value || "")
      : "";

  const dialog = await openPickerDialog(page, trigger);
  await pickDay(dialog, range.start);
  // 캘린더 상태가 안정될 때까지 잠시 기다린다 (시작일 선택 후 UI 전환)
  await page.waitForTimeout(300);
  await pickDay(dialog, range.end);

  const apply = await firstVisible([
    dialog.getByRole("button", { name: /^(적용|확인|선택|apply|ok)$/iu }),
  ]);
  if (apply) await apply.click();

  // 반드시 검증 — 범위가 실제로 반영됐는지 확인한다
  await verifySelectedRange(readTriggerText, range);

  return trigger;
}
