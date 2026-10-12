import { chromium } from "playwright";
import { saveElementMap } from "./element-map.js";
import { exploreScreen } from "./explore-screen.js";

export interface ExploreJobOptions {
  startUrl: string;
  login?: { email: string; password: string };
  signal?: AbortSignal;
  onLog?: (message: string) => void;
  /** headless 모드 여부. 기본 true (자동 탐색). */
  headless?: boolean;
}

async function loginIfNeeded(
  page: import("playwright").Page,
  login: { email: string; password: string },
  log: (msg: string) => void,
): Promise<void> {
  const passwordInput = page.locator('input[type="password"]').first();
  const visible = await passwordInput
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;

  log("로그인 화면 감지 — 공통 계정으로 로그인 중...");
  const emailInput = page.locator('input[type="email"], input[type="text"]').first();
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(login.email);
  }
  await passwordInput.fill(login.password);

  const loginBtn = page
    .locator('button, input[type="submit"]')
    .filter({ hasText: /로그인|sign.?in|login/iu })
    .first();
  if (await loginBtn.isVisible().catch(() => false)) {
    await loginBtn.click({ timeout: 3000 });
    await passwordInput.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    log("로그인 완료");
  }
}

/**
 * 브라우저를 열고 startUrl 화면을 탐색한 뒤 요소 맵을 저장한다.
 * 저장된 요소 맵의 mapId를 반환한다.
 */
export async function runExploreJob(options: ExploreJobOptions): Promise<string> {
  const log = options.onLog ?? (() => undefined);
  const browser = await chromium.launch({ headless: options.headless ?? true, slowMo: 40 });
  const context = await browser.newContext();
  const page = await context.newPage();

  const close = async () => {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };

  const onAbort = () => {
    void close();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (options.signal?.aborted) throw new Error("사용자가 중지했습니다.");

    log(`${options.startUrl} 열기 중...`);
    await page.goto(options.startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    if (options.login?.email && options.login.password) {
      await loginIfNeeded(page, options.login, log);
    }

    if (options.signal?.aborted) throw new Error("사용자가 중지했습니다.");

    const map = await exploreScreen(page, {
      url: options.startUrl,
      onLog: log,
    });

    log(`탐색 완료 — 요소 ${map.elements.length}개, 조회 API ${map.queryApiUrls.length}개`);

    const meta = saveElementMap(map);
    log(`요소 맵 저장 완료 (mapId: ${meta.mapId})`);
    return meta.mapId;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    await close();
  }
}
