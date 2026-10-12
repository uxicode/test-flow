import { chromium, type Page } from "playwright";
import { EMIT_BINDING_NAME, INSPECT_BROWSER_SCRIPT } from "./inspect-selector-script.js";

export interface InspectSelectorOptions {
  startUrl: string;
  login?: { email: string; password: string };
  signal?: AbortSignal;
  /** 테스트용. 기본값은 사용자가 직접 보고 고르는 창(false). */
  headless?: boolean;
  /** 선택 대기 최대 시간(ms). 기본 5분. */
  timeoutMs?: number;
  /** 테스트용. 선택 UI 주입 직후 호출되며, 사용자 조작을 대신한다. */
  onReady?: (page: Page) => Promise<void>;
}

/**
 * DOM Element에서 가장 명확하고 식별력 높은 CSS 셀렉터를 계산합니다.
 * (id -> data-* 속성 -> role -> 주요 class -> tag+class)
 */
export function computeOptimalSelector(el: HTMLElement): string {
  // 1. 유효한 id
  if (el.id && /^[A-Za-z][A-Za-z0-9_-]*$/u.test(el.id)) {
    return `#${el.id}`;
  }

  // 2. data-* 속성 (data-testid, data-select-..., data-floating-ui-... 등)
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-")) {
      if (attr.value) {
        return `[${attr.name}="${attr.value}"]`;
      }
      return `[${attr.name}]`;
    }
  }

  // 3. role 속성
  const role = el.getAttribute("role");
  if (role) {
    return `[role="${role}"]`;
  }

  // 4. aria 속성
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    return `[aria-label="${ariaLabel}"]`;
  }

  // 5. 클래스명 (테일윈드 등 유틸리티 클래스보다 의미 있는 컴포넌트 클래스 우선)
  if (el.className && typeof el.className === "string") {
    const classes = el.className
      .trim()
      .split(/\s+/u)
      .filter((cls) => cls && !cls.includes(":") && !cls.includes("/"));
    
    // 컴포넌트성 클래스 우선 (menu, dropdown, popover, select, list, modal 등)
    const semantic = classes.filter((cls) =>
      /menu|dropdown|popover|select|list|dialog|modal|panel|container|content|box/iu.test(cls),
    );
    if (semantic.length > 0) {
      return semantic.map((cls) => `.${cls}`).join("");
    }
    if (classes.length > 0 && classes.length <= 3) {
      return classes.map((cls) => `.${cls}`).join("");
    }
  }

  // 6. 태그명 + 클래스 조합 또는 태그명
  const tagName = el.tagName.toLowerCase();
  if (el.classList.length > 0) {
    const firstClass = el.classList[0];
    if (firstClass && !firstClass.includes(":") && !firstClass.includes("/")) {
      return `${tagName}.${firstClass}`;
    }
  }

  return tagName;
}

const DEFAULT_PICK_TIMEOUT_MS = 300_000;

async function loginIfNeeded(page: Page, login: NonNullable<InspectSelectorOptions["login"]>): Promise<void> {
  const passwordInput = page.locator('input[type="password"]').first();
  const shown = await passwordInput
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;

  const emailInput = page.locator('input[type="email"], input[type="text"]').first();
  if (!(await emailInput.isVisible().catch(() => false))) return;
  await emailInput.fill(login.email);
  await passwordInput.fill(login.password);
  const loginButton = page
    .locator('button, input[type="submit"]')
    .filter({ hasText: /로그인|sign in|login/iu })
    .first();
  if (!(await loginButton.isVisible().catch(() => false))) return;
  await loginButton.click();
  // 로그인 후 이동이 끝날 때까지 기다린다 (비밀번호 입력란이 사라지면 완료).
  await passwordInput.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

/**
 * 브라우저를 열고 사용자가 고른 요소의 CSS 셀렉터를 가져옵니다.
 * 요소를 클릭하면 "선택"만 되고, 배너의 [적용하기]를 눌러야 확정됩니다.
 * 취소·창 닫기·시간 초과는 빈 문자열을 돌려줍니다.
 */
export async function inspectSelector(options: InspectSelectorOptions): Promise<string> {
  const browser = await chromium.launch({ headless: options.headless ?? false, slowMo: 40 });
  const context = await browser.newContext();
  const page = await context.newPage();

  let selectorResult = "";
  let finished = false;

  const closeBrowser = async () => {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };

  const onAbort = () => {
    finished = true;
    void closeBrowser();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  page.on("close", () => {
    finished = true;
  });

  try {
    // 바인딩은 페이지 이동 후에도 유지된다. 선택 UI는 로그인이 끝난 뒤에 주입한다.
    await page.exposeFunction(EMIT_BINDING_NAME, (selector: string) => {
      selectorResult = selector;
      finished = true;
    });

    await page.goto(options.startUrl, { waitUntil: "domcontentloaded" });
    if (options.login?.email && options.login.password) await loginIfNeeded(page, options.login);

    // 이후 이동하는 모든 문서에 UI를 다시 심고, 현재 문서에도 즉시 주입한다.
    await context.addInitScript(INSPECT_BROWSER_SCRIPT);
    await page.evaluate(INSPECT_BROWSER_SCRIPT);
    if (options.onReady) void options.onReady(page).catch(() => undefined);

    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_PICK_TIMEOUT_MS);
    while (Date.now() < deadline && !finished) {
      if (page.isClosed()) break;
      await page.waitForTimeout(250).catch(() => undefined);
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    await closeBrowser();
  }

  return selectorResult;
}
