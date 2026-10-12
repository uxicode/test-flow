import type { Page } from "playwright";
import { CONTROL_KIND, type ControlKind } from "@testflow/tc";
import { COLLECT_ELEMENTS_SCRIPT } from "./collect-elements-script.js";
import {
  ELEMENT_MAP_VERSION,
  normalizeUrl,
  type ElementEntry,
  type LocatorCandidate,
  type ScreenElementMap,
} from "./element-map.js";

// ---------------------------------------------------------------------------
// DOM 평가 함수 (브라우저 컨텍스트에서 실행)
// ---------------------------------------------------------------------------

interface RawElement {
  label: string;
  rawTag: string;
  rawType: string | null;
  rawRole: string | null;
  ariaHaspopup: string | null;
  testId: string | null;
  ariaLabel: string | null;
  labelText: string | null;
  placeholder: string | null;
  domId: string | null;
  cssPath: string;
  nativeOptions: string[];
  rect: { x: number; y: number; width: number; height: number };
}

// ---------------------------------------------------------------------------
// 컨트롤 종류 분류 (Node 컨텍스트)
// ---------------------------------------------------------------------------

function classifyControlKind(raw: RawElement): ControlKind {
  if (raw.rawTag === "select") return CONTROL_KIND.select;
  if (raw.rawTag === "textarea") return CONTROL_KIND.textarea;
  if (raw.rawTag === "input") {
    const t = (raw.rawType ?? "text").toLowerCase();
    if (t === "password") return CONTROL_KIND.password;
    if (t === "checkbox") return CONTROL_KIND.checkbox;
    if (t === "radio") return CONTROL_KIND.radio;
    if (t === "file") return CONTROL_KIND.file;
    if (t === "date" || t === "datetime-local" || t === "month" || t === "week") return CONTROL_KIND.date;
    return CONTROL_KIND.text;
  }
  if (raw.rawRole === "combobox" || raw.ariaHaspopup === "listbox" || raw.ariaHaspopup === "menu") {
    return CONTROL_KIND.combobox;
  }
  if (raw.rawRole === "radio") return CONTROL_KIND.radio;
  if (raw.rawRole === "checkbox") return CONTROL_KIND.checkbox;
  return CONTROL_KIND.text;
}

// ---------------------------------------------------------------------------
// 로케이터 후보 빌드 (우선순위 순)
// ---------------------------------------------------------------------------

function buildLocatorCandidates(raw: RawElement): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];

  // 1. testid
  if (raw.testId) {
    candidates.push({ strategy: "testid", value: `[data-testid="${raw.testId}"]` });
  }

  // 2. role + accessible name
  const role = roleForLocator(raw);
  const name = raw.ariaLabel || raw.label;
  if (role && name) {
    candidates.push({ strategy: "role+name", value: `${role}|${name}` });
  }

  // 3. label text (연결된 <label>)
  if (raw.label && !raw.ariaLabel) {
    candidates.push({ strategy: "label", value: raw.label });
  }

  // 4. placeholder
  if (raw.placeholder) {
    candidates.push({ strategy: "placeholder", value: raw.placeholder });
  }

  // 5. CSS (폴백)
  if (raw.cssPath) {
    candidates.push({ strategy: "css", value: raw.cssPath });
  }

  return candidates;
}

function roleForLocator(raw: RawElement): string | null {
  if (raw.rawRole) return raw.rawRole;
  if (raw.rawTag === "input") {
    const t = (raw.rawType ?? "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "password" || t === "text" || t === "email" || t === "search" || t === "tel" || t === "url") {
      return "textbox";
    }
  }
  if (raw.rawTag === "textarea") return "textbox";
  if (raw.rawTag === "select") return "combobox";
  if (raw.ariaHaspopup === "listbox") return "combobox";
  return null;
}

// ---------------------------------------------------------------------------
// 드롭다운 옵션 컨테이너 감지
// ---------------------------------------------------------------------------

async function detectDropdownContainer(
  page: Page,
  entry: ElementEntry,
  locators: LocatorCandidate[],
): Promise<"inline" | "portal" | "listbox" | null> {
  const control = entry.controlKind;
  if (control === CONTROL_KIND.select) return "listbox";
  if (control !== CONTROL_KIND.combobox) return null;

  // combobox 트리거를 찾아서 클릭해 본다
  const trigger = await findTriggerLocator(page, locators);
  if (!trigger) return null;

  try {
    const portalsBefore = await page.locator('[data-floating-ui-portal], [data-radix-popper-content-wrapper]').count();
    const listboxesBefore = await page.locator('[role="listbox"], [role="menu"]').count();

    await trigger.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(400);

    const portalsAfter = await page.locator('[data-floating-ui-portal], [data-radix-popper-content-wrapper]').count();
    const listboxesAfter = await page.locator('[role="listbox"], [role="menu"]').count();

    // portal 레이어 새로 생겼으면 portal
    if (portalsAfter > portalsBefore) {
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(200);
      return "portal";
    }

    // listbox/menu role 요소가 새로 생겼으면 — 위치로 판단
    if (listboxesAfter > listboxesBefore) {
      const container = await page
        .locator('[role="listbox"], [role="menu"]')
        .last()
        .evaluate((el) => {
          let p = el.parentElement;
          while (p) {
            if (p === document.body || p.tagName === "BODY") return "portal";
            const style = window.getComputedStyle(p);
            if (style.position === "fixed" || style.position === "absolute") return "portal";
            p = p.parentElement;
          }
          return "inline";
        })
        .catch(() => null);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(200);
      return container as "inline" | "portal" | null;
    }

    await page.keyboard.press("Escape").catch(() => undefined);
    return null;
  } catch {
    await page.keyboard.press("Escape").catch(() => undefined);
    return null;
  }
}

async function findTriggerLocator(page: Page, locators: LocatorCandidate[]) {
  for (const candidate of locators) {
    try {
      let loc;
      if (candidate.strategy === "testid" || candidate.strategy === "css") {
        loc = page.locator(candidate.value).first();
      } else if (candidate.strategy === "role+name") {
        const [role, name] = candidate.value.split("|");
        if (role && name) loc = page.getByRole(role as Parameters<Page["getByRole"]>[0], { name }).first();
      } else if (candidate.strategy === "label") {
        loc = page.getByLabel(candidate.value).first();
      } else if (candidate.strategy === "placeholder") {
        loc = page.getByPlaceholder(candidate.value).first();
      }
      if (loc && (await loc.isVisible().catch(() => false))) return loc;
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 조회 API URL 관찰
// ---------------------------------------------------------------------------

const QUERY_BUTTON_TEXT = /조회|검색|search|filter|apply|적용/iu;
const API_URL_PATTERN = /\/api\/|\/v\d\/|\/graphql|\/rest\//iu;
const STATIC_ASSET_PATTERN = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/iu;

async function observeQueryApiUrls(page: Page, log: (msg: string) => void): Promise<string[]> {
  const observed = new Set<string>();

  const handler = (request: { url: () => string; resourceType: () => string }) => {
    const url = request.url();
    const type = request.resourceType();
    if (type === "fetch" || type === "xhr") {
      if (API_URL_PATTERN.test(url) && !STATIC_ASSET_PATTERN.test(url)) {
        observed.add(url);
      }
    }
  };

  page.on("request", handler);
  try {
    // 조회 버튼 찾기
    const queryButton = await page
      .locator('button, [role="button"], input[type="submit"]')
      .filter({ hasText: QUERY_BUTTON_TEXT })
      .first()
      .isVisible()
      .then((v) =>
        v
          ? page.locator('button, [role="button"], input[type="submit"]').filter({ hasText: QUERY_BUTTON_TEXT }).first()
          : null,
      )
      .catch(() => null);

    if (queryButton) {
      log("조회 버튼 발견 — API URL 수집 중...");
      await queryButton.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      log(`관찰된 API URL: ${observed.size}개`);
    }
  } catch {
    // 버튼 없거나 클릭 실패 — 무시
  } finally {
    page.off("request", handler);
  }

  return [...observed];
}

// ---------------------------------------------------------------------------
// 메인 탐색 함수
// ---------------------------------------------------------------------------

export interface ExploreOptions {
  url: string;
  onLog?: (message: string) => void;
  /** 드롭다운 옵션 컨테이너 감지 여부 (기본 true) */
  detectDropdowns?: boolean;
  /** 조회 API 관찰 여부 (기본 true) */
  observeApis?: boolean;
}

export async function exploreScreen(page: Page, options: ExploreOptions): Promise<ScreenElementMap> {
  const log = options.onLog ?? (() => undefined);
  const detectDropdowns = options.detectDropdowns ?? true;
  const observeApis = options.observeApis ?? true;

  // 페이지가 안정화될 때까지 대기
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await page
    .locator("input, button, select, [role='combobox']")
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(500);

  const screenTitle = await page.title().catch(() => "");
  log(`화면 제목: ${screenTitle || "(없음)"}`);

  // DOM에서 대화형 요소 수집
  log("대화형 요소 수집 중...");
  const rawElements = await page.evaluate(COLLECT_ELEMENTS_SCRIPT) as RawElement[];
  log(`${rawElements.length}개 요소 발견`);

  // 요소별 엔트리 빌드
  const elements: ElementEntry[] = [];
  for (const raw of rawElements) {
    const controlKind = classifyControlKind(raw);
    const locators = buildLocatorCandidates(raw);
    elements.push({
      label: raw.label || raw.placeholder || raw.cssPath,
      controlKind,
      locators,
      dropdownOptionContainer: null,
    });
  }

  // 드롭다운 옵션 컨테이너 감지 (best-effort)
  if (detectDropdowns) {
    const dropdowns = elements.filter(
      (e) => e.controlKind === CONTROL_KIND.combobox || e.controlKind === CONTROL_KIND.select,
    );
    if (dropdowns.length > 0) {
      log(`드롭다운 ${dropdowns.length}개 감지 중...`);
      for (const entry of dropdowns) {
        entry.dropdownOptionContainer = await detectDropdownContainer(page, entry, entry.locators);
      }
    }
  }

  // 조회 API URL 관찰 (best-effort)
  let queryApiUrls: string[] = [];
  if (observeApis) {
    queryApiUrls = await observeQueryApiUrls(page, log);
  }

  return {
    $version: ELEMENT_MAP_VERSION,
    url: options.url,
    normalizedUrl: normalizeUrl(options.url),
    exploredAt: new Date().toISOString(),
    screenTitle,
    elements,
    queryApiUrls,
  };
}
