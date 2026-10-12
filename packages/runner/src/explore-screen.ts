import type { Page } from "playwright";
import { CONTROL_KIND, type ControlKind } from "@testflow/tc";
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
  /** 폼 연결이 없지만 요소 근처에 보이는 텍스트 (preceding sibling / 부모 텍스트) */
  nearbyText: string | null;
  rect: { x: number; y: number; width: number; height: number };
}

/** 브라우저 내에서 실행되는 순수 JS 함수 — 모든 대화형 요소를 수집한다. */
function collectElementsFromDOM(): RawElement[] {
  function getAccessibleName(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();

    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }

    const id = el.getAttribute("id");
    if (id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent?.trim()) return lbl.textContent.trim();
      } catch {
        // ignore
      }
    }

    const wrapping = el.closest("label");
    if (wrapping && wrapping !== el) {
      const clone = wrapping.cloneNode(true) as Element;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }

    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
      const txt = (el as HTMLElement).innerText?.trim() || el.getAttribute("title")?.trim() || "";
      if (txt) return txt;
    }

    return (
      el.getAttribute("placeholder")?.trim() ||
      el.getAttribute("title")?.trim() ||
      el.getAttribute("name")?.trim() ||
      ""
    );
  }

  function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
    } catch {
      return false;
    }
    return true;
  }

  function getTestId(el: Element): string | null {
    return (
      el.getAttribute("data-testid") ||
      el.getAttribute("data-test") ||
      el.getAttribute("data-cy") ||
      el.getAttribute("data-qa") ||
      null
    );
  }

  /**
   * 폼 연결이 없는 경우의 근처 텍스트를 가져온다.
   * 우선순위: 바로 앞 형제 요소 텍스트 → 부모 텍스트(입력 요소 제외)
   */
  function getNearbyText(el: Element): string | null {
    const MAX_LEN = 40;

    // 바로 앞 형제의 텍스트
    const prev = el.previousElementSibling;
    if (prev && !["input", "select", "textarea", "button"].includes(prev.tagName.toLowerCase())) {
      const text = prev.textContent?.trim();
      if (text && text.length >= 1 && text.length <= MAX_LEN) return text;
    }

    // 부모의 텍스트(입력 요소 자체 제외)
    const parent = el.parentElement;
    if (parent) {
      const clone = parent.cloneNode(true) as Element;
      clone.querySelectorAll("input,select,textarea,button").forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text && text.length >= 1 && text.length <= MAX_LEN) return text;
    }

    return null;
  }

  function computeCssPath(el: Element): string {
    const id = el.getAttribute("id");
    if (id && /^[A-Za-z][\w-]*$/u.test(id)) return `#${id}`;

    const testId = getTestId(el);
    if (testId) return `[data-testid="${testId}"]`;

    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 6) {
      const tag = cur.tagName.toLowerCase();
      const cid = cur.getAttribute("id");
      if (cid && /^[A-Za-z][\w-]*$/u.test(cid)) {
        parts.unshift(`#${cid}`);
        break;
      }
      const ctid = getTestId(cur);
      if (ctid) {
        parts.unshift(`[data-testid="${ctid}"]`);
        break;
      }
      const parent: Element | null = cur.parentElement;
      if (parent) {
        const curTag = cur.tagName;
        const siblings = Array.from(parent.children).filter((s: Element) => s.tagName === curTag);
        if (siblings.length > 1) {
          parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(cur) + 1})`);
        } else {
          parts.unshift(tag);
        }
      } else {
        parts.unshift(tag);
      }
      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  const seen = new Set<Element>();
  const results: RawElement[] = [];

  const QUERY_SELECTORS = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    "textarea",
    "select",
    '[role="combobox"]:not(input)',
    '[role="radio"]:not(input)',
    '[role="checkbox"]:not(input)',
    '[aria-haspopup="listbox"]:not(select):not(input)',
    '[aria-haspopup="menu"]:not(select):not(input)',
  ];

  const allEls = new Set<Element>();
  for (const sel of QUERY_SELECTORS) {
    try {
      document.querySelectorAll(sel).forEach((e) => allEls.add(e));
    } catch {
      // 잘못된 셀렉터는 무시
    }
  }

  for (const el of allEls) {
    if (seen.has(el) || !isVisible(el)) continue;
    seen.add(el);

    const label = getAccessibleName(el);
    const tag = el.tagName.toLowerCase();
    const testId = getTestId(el);
    const ariaLabel = el.getAttribute("aria-label");
    const placeholder = el.getAttribute("placeholder");
    const domId = el.getAttribute("id");
    const rect = el.getBoundingClientRect();

    const nativeOptions =
      tag === "select"
        ? Array.from((el as HTMLSelectElement).options)
            .map((o) => o.text.trim())
            .filter(Boolean)
        : [];

    // Only compute nearbyText when the accessible name wasn't formally associated
    const hasForwardLabel = Boolean(ariaLabel || (domId && document.querySelector(`label[for="${domId}"]`)) || el.getAttribute("aria-labelledby"));
    const nearbyText = hasForwardLabel ? null : getNearbyText(el);

    results.push({
      label,
      rawTag: tag,
      rawType: el.getAttribute("type"),
      rawRole: el.getAttribute("role"),
      ariaHaspopup: el.getAttribute("aria-haspopup"),
      testId,
      ariaLabel,
      labelText: null,
      placeholder,
      domId,
      cssPath: computeCssPath(el),
      nativeOptions,
      nearbyText,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }

  return results;
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

  // 1. testid (가장 안정적)
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

  // 4. nearby text (비연결 근접 텍스트 — label보다 신뢰도 낮음)
  if (raw.nearbyText && raw.nearbyText !== raw.label) {
    candidates.push({ strategy: "nearby-text", value: raw.nearbyText });
  }

  // 5. placeholder
  if (raw.placeholder) {
    candidates.push({ strategy: "placeholder", value: raw.placeholder });
  }

  // 6. CSS (폴백)
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
  const rawElements = await page.evaluate(collectElementsFromDOM);
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
