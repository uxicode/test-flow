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

function isoDateKey(date: ParsedDate): string {
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
        `[aria-label*="${date.year}"][aria-label*="${monthLabel}"][aria-label*="${dayText}"]`,
      ),
      scope.locator(
        `button[aria-label*="${date.year}"][aria-label*="${monthLabel}"][aria-label*="${dayText}"]`,
      ),
    );
  }
  const candidates: Locator[] = [
    scope.locator(`[data-date="${key}"]`),
    scope.locator(`button[data-day="${key}"]`),
    ...ariaDayCandidates,
    scope.getByRole("gridcell", {
      name: new RegExp(`${date.year}.*${date.month}.*${dayText}|${dayText}.*${date.month}.*${date.year}`, "u"),
    }),
    scope.locator("button", { hasText: new RegExp(`^${dayText}$`, "u") }),
    scope.locator("td", { hasText: new RegExp(`^${dayText}$`, "u") }),
  ];
  return firstVisible(candidates);
}

async function ensureDayVisible(scope: Locator, date: ParsedDate): Promise<void> {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const day = await clickCalendarDay(scope, date);
    if (day) return;
    const next = await firstVisible([
      scope.getByRole("button", { name: /다음|next|>/iu }),
      scope.locator('button[aria-label*="다음"], button[aria-label*="Next"]'),
    ]);
    if (!next) break;
    await next.click();
  }
}

async function pickDay(scope: Locator, date: ParsedDate): Promise<Locator> {
  await ensureDayVisible(scope, date);
  const day = await clickCalendarDay(scope, date);
  if (!day) throw new Error(`${isoDateKey(date)} 날짜 칸을 찾지 못했습니다.`);
  await day.click();
  return day;
}

export async function applyCustomDateRange(
  page: Page,
  target: string,
  value: string,
): Promise<Locator> {
  const range =
    parseDateRangeValue(value) ??
    parseDateRangeValue(defaultDateRangeValue());
  if (!range) throw new Error(`${target} 기간 값을 해석하지 못했습니다.`);

  const trigger = await locateDatePickerTrigger(page, target);
  if (!trigger) throw new Error(`${target} 날짜 선택 버튼을 찾지 못했습니다.`);

  const dialog = await openPickerDialog(page, trigger);
  await pickDay(dialog, range.start);
  await pickDay(dialog, range.end);

  const apply = await firstVisible([
    dialog.getByRole("button", { name: /적용|확인|선택|apply|ok/iu }),
    page.getByRole("button", { name: /적용|확인|선택|apply|ok/iu }),
  ]);
  if (apply) await apply.click();
  else await page.keyboard.press("Escape").catch(() => undefined);

  return trigger;
}
