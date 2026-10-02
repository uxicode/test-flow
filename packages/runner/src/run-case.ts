import type { TestCase } from "@testflow/tc";
import { chromium, type Locator, type Page } from "playwright";
import { applyFieldValue } from "./apply-field.js";
import { isLoginCase, isLoginStartUrl, valuesForCase } from "./case-values.js";
import { findShownPhrase, openedScreenTitle, phrasesToFind } from "./match-phrase.js";

export interface RunLog {
  message: string;
  at: string;
}

export function readableRunError(error: unknown, expectedText: string): string {
  const message = error instanceof Error ? error.message.split("\n")[0] ?? "실행 실패" : "실행 실패";
  if (/closed|disconnected|Target page/iu.test(message)) return "브라우저가 닫혀 실행이 끝났습니다.";
  const phrase = phrasesToFind(expectedText)[0] ?? expectedText.trim();
  if (message.includes("Timeout") || message.includes("waiting for") || message.includes("가 보이지 않습니다"))
    return `화면에 "${phrase}" 가 보이지 않습니다.`;
  return message;
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

async function locateField(page: Page, target: string): Promise<Locator> {
  const pattern = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const typed = /이메일|email/iu.test(target)
    ? page.locator('input[type="email"], input[type="text"]')
    : /비밀번호|password/iu.test(target)
      ? page.locator('input[type="password"]')
      : page.locator("input");
  const found = await firstVisible([
    page.getByLabel(pattern),
    page.getByPlaceholder(pattern),
    page.getByRole("textbox", { name: pattern }),
    typed,
  ]);
  if (!found) throw new Error(`${target} 입력란을 찾지 못했습니다.`);
  return found;
}

export function buttonNameVariants(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);

  if (trimmed.endsWith("하기")) {
    const stem = trimmed.slice(0, -2).trim();
    if (stem) variants.add(stem);
  } else {
    variants.add(`${trimmed}하기`);
  }

  if (trimmed.endsWith("버튼")) {
    const stem = trimmed.slice(0, -2).trim();
    if (stem) {
      variants.add(stem);
      variants.add(`${stem}하기`);
    }
  }

  if (/^조회(하기)?$/u.test(trimmed)) {
    variants.add("조회");
    variants.add("조회하기");
    variants.add("검색");
    variants.add("검색하기");
  } else if (/^검색(하기)?$/u.test(trimmed)) {
    variants.add("검색");
    variants.add("검색하기");
    variants.add("조회");
    variants.add("조회하기");
  } else if (/^확인(하기)?$/u.test(trimmed)) {
    variants.add("확인");
    variants.add("확인하기");
    variants.add("적용");
    variants.add("적용하기");
  } else if (/^저장(하기)?$/u.test(trimmed)) {
    variants.add("저장");
    variants.add("저장하기");
    variants.add("등록");
    variants.add("등록하기");
  }

  return [...variants];
}

async function locateButton(page: Page, name: string): Promise<Locator> {
  const variants = buttonNameVariants(name);
  for (const variant of variants) {
    const pattern = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const found = await firstVisible([
      page.getByRole("button", { name: pattern }),
      page.getByRole("link", { name: pattern }),
      page.locator('button, [role="button"], a, input[type="button"], input[type="submit"]').filter({ hasText: pattern }),
      page.locator('button, [role="button"], a').getByText(pattern, { exact: false }),
      page.locator('input[type="submit"], input[type="button"]'),
    ]);
    if (found) return found;
  }
  throw new Error(`${name} 버튼을 찾지 못했습니다.`);
}

async function typeInto(
  page: Page,
  target: string,
  value: string,
  log: (message: string) => void,
): Promise<void> {
  const field = await locateField(page, target);
  const point = await pointAt(page, field);
  log(`${target} 입력란을 가리킴`);
  await page.waitForTimeout(150);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(100);
  if (!value) {
    await field.fill("");
    log(`${target} 입력란을 비웁니다.`);
    return;
  }
  await field.pressSequentially(value, { delay: 85 });
  log(`${target} 입력란에 값을 넣습니다.`);
  await page.waitForTimeout(150);
}

async function ensureCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("testflow-cursor")) return;

    // CSS 키프레임 애니메이션 주입
    const style = document.createElement("style");
    style.id = "testflow-styles";
    style.textContent = [
      "@keyframes tf-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.85)}}",
      "@keyframes tf-ripple{from{width:0;height:0;opacity:0.85}to{width:64px;height:64px;opacity:0}}",
      "@keyframes tf-slidein{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes tf-spin{to{transform:rotate(360deg)}}",
    ].join("\n");
    document.head.append(style);

    // 바깥 글로우 링
    const ring = document.createElement("div");
    ring.id = "testflow-cursor";
    ring.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "z-index:2147483647",
      "width:28px",
      "height:28px",
      "margin:-14px 0 0 -14px",
      "border-radius:50%",
      "border:2px solid rgba(139,92,246,0.85)",
      "background:rgba(139,92,246,0.07)",
      "box-shadow:0 0 0 1px rgba(139,92,246,0.25),0 0 16px rgba(139,92,246,0.4)",
      "pointer-events:none",
      "transform:translate(24px,24px)",
      "transition:transform 240ms cubic-bezier(0.2,0.8,0.4,1)",
    ].join(";");

    // 중앙 채워진 도트
    const dot = document.createElement("div");
    dot.style.cssText = [
      "position:absolute",
      "top:50%",
      "left:50%",
      "transform:translate(-50%,-50%)",
      "width:6px",
      "height:6px",
      "border-radius:50%",
      "background:rgba(167,139,250,1)",
      "box-shadow:0 0 6px rgba(139,92,246,0.9)",
    ].join(";");

    ring.append(dot);
    document.documentElement.append(ring);
  });
}

async function ensureHud(page: Page, title: string): Promise<void> {
  await page.evaluate((hudTitle) => {
    if (document.getElementById("testflow-hud")) {
      const t = document.getElementById("testflow-hud-title");
      if (t) t.textContent = hudTitle;
      return;
    }
    const hud = document.createElement("div");
    hud.id = "testflow-hud";
    hud.style.cssText = [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:2147483646",
      "min-width:256px",
      "max-width:340px",
      "padding:12px 14px 13px",
      "background:rgba(9,9,20,0.92)",
      "backdrop-filter:blur(18px)",
      "-webkit-backdrop-filter:blur(18px)",
      "border:1px solid rgba(139,92,246,0.32)",
      "border-radius:14px",
      "box-shadow:0 16px 48px rgba(0,0,0,0.65),0 0 0 1px rgba(139,92,246,0.07)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "color:#cbd5e1",
      "pointer-events:none",
      "animation:tf-slidein 0.28s cubic-bezier(0.16,1,0.3,1)",
    ].join(";");

    // 헤더: 펄스 도트 + 라벨
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:7px;margin-bottom:9px;";
    const statusDot = document.createElement("div");
    statusDot.id = "testflow-hud-dot";
    statusDot.style.cssText = [
      "width:8px",
      "height:8px",
      "border-radius:50%",
      "background:#a78bfa",
      "box-shadow:0 0 8px rgba(167,139,250,0.75)",
      "animation:tf-pulse 1.5s ease-in-out infinite",
      "flex-shrink:0",
    ].join(";");
    const brandLabel = document.createElement("span");
    brandLabel.style.cssText = "font-size:10px;font-weight:700;letter-spacing:0.09em;color:#a78bfa;text-transform:uppercase;";
    brandLabel.textContent = "TestFlow Runner";
    header.append(statusDot, brandLabel);

    // TC 제목
    const titleEl = document.createElement("div");
    titleEl.id = "testflow-hud-title";
    titleEl.style.cssText = "font-size:12.5px;font-weight:600;color:#f1f5f9;margin-bottom:8px;line-height:1.45;word-break:break-word;";
    titleEl.textContent = hudTitle;

    // 구분선
    const hr = document.createElement("div");
    hr.style.cssText = "height:1px;background:linear-gradient(90deg,rgba(139,92,246,0.35),rgba(139,92,246,0));margin-bottom:8px;";

    // 현재 액션
    const action = document.createElement("div");
    action.id = "testflow-hud-action";
    action.style.cssText = "font-size:11.5px;color:#94a3b8;line-height:1.5;min-height:16px;transition:color 0.2s;";
    action.textContent = "시작 중…";

    hud.append(header, titleEl, hr, action);
    document.documentElement.append(hud);
  }, title);
}

function setHudAction(page: Page, message: string): void {
  page.evaluate((msg) => {
    const el = document.getElementById("testflow-hud-action");
    if (el) el.textContent = msg;
  }, message).catch(() => undefined);
}

async function pointAt(page: Page, locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => undefined);
  let box = await locator.boundingBox({ timeout: 1500 }).catch(() => null);
  if (!box) {
    box = await locator.first().boundingBox({ timeout: 1500 }).catch(() => null);
  }
  if (!box) {
    return { x: 100, y: 100 };
  }
  const x = Math.max(10, box.x + Math.min(box.width / 2, 48));
  const y = Math.max(10, box.y + box.height / 2);

  // CSS transition이 시각 이동을 처리 — transform만 설정하면 된다
  await page.evaluate(({ tx, ty }) => {
    const ring = document.getElementById("testflow-cursor");
    if (ring) ring.style.transform = `translate(${tx}px,${ty}px)`;
  }, { tx: x, ty: y }).catch(() => undefined);

  // Playwright 실제 마우스는 14스텝 이동 (자연스러운 궤적 및 hover/mouseover 이벤트 정확도 유지)
  const STEPS = 14;
  await page.mouse.move(x, y, { steps: STEPS }).catch(() => undefined);

  // 클릭 리플 파문 이펙트 표시
  await page.evaluate(({ rx, ry }) => {
    const ripple = document.createElement("div");
    ripple.style.cssText = [
      "position:fixed",
      `left:${rx}px`,
      `top:${ry}px`,
      "border-radius:50%",
      "border:2px solid rgba(167,139,250,0.65)",
      "background:rgba(139,92,246,0.06)",
      "transform:translate(-50%,-50%)",
      "pointer-events:none",
      "z-index:2147483645",
      "animation:tf-ripple 0.65s cubic-bezier(0,0.55,0.45,1) forwards",
    ].join(";");
    document.documentElement.append(ripple);
    setTimeout(() => ripple.remove(), 750);
  }, { rx: x, ry: y }).catch(() => undefined);

  // 대상 요소 하이라이트 (바이올렛 테마)
  await locator.evaluate((el) => {
    el.style.outline = "2px solid rgba(139,92,246,0.9)";
    el.style.outlineOffset = "3px";
    el.style.boxShadow = "0 0 0 4px rgba(139,92,246,0.15)";
  }).catch(() => undefined);

  // CSS transition 240ms + 여유 40ms (사용자가 마우스 도착을 눈으로 인지할 수 있는 시간)
  await page.waitForTimeout(280);
  return { x, y };
}

async function loginFormOpen(page: Page): Promise<boolean> {
  const fields = page.locator('input[type="password"]');
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    if (await fields.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function hasButton(page: Page, name: string): Promise<boolean> {
  try {
    await locateButton(page, name);
    return true;
  } catch {
    return false;
  }
}

async function waitForLoginForm(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await loginFormOpen(page)) return true;
    await page.waitForTimeout(250);
  }
  return loginFormOpen(page);
}

async function signInWithSharedAccount(
  page: Page,
  login: { email: string; password: string },
  startUrl: string,
  log: (message: string) => void,
  title?: string,
): Promise<void> {
  log("실행 전 공통 계정으로 로그인");
  await typeInto(page, "이메일", login.email, log);
  await typeInto(page, "비밀번호", login.password, log);
  const button = await locateButton(page, "로그인");
  const point = await pointAt(page, button);
  log("로그인 버튼을 가리킴");
  await page.waitForTimeout(250);
  try {
    await button.click({ timeout: 3000 });
  } catch {
    await page.mouse.click(point.x, point.y);
  }
  log("로그인 버튼을 누름");
  await page.waitForTimeout(200);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && (await loginFormOpen(page))) await page.waitForTimeout(300);
  if (await loginFormOpen(page)) throw new Error("공통 계정으로 로그인하지 못했습니다.");
  if (isLoginStartUrl(startUrl)) return;
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await ensureCursor(page);
  if (title) await ensureHud(page, title);
  if (await loginFormOpen(page)) throw new Error("로그인 뒤에도 시작 화면에 들어가지 못했습니다.");
}

async function waitForShownPhrase(page: Page, phrases: string[]): Promise<string> {
  const deadline = Date.now() + 15_000;
  const label = phrases[0] ?? "";
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText().catch(() => "");
    const shown = findShownPhrase(text, phrases);
    if (shown) return shown;
    await page.waitForTimeout(300);
  }
  throw new Error(`화면에 "${label}" 가 보이지 않습니다.`);
}

async function waitForSuccessScreen(page: Page, phrases: string[]): Promise<{ shown: string; landed: boolean }> {
  const deadline = Date.now() + 15_000;
  const label = phrases[0] ?? "";
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText().catch(() => "");
    const shown = findShownPhrase(text, phrases);
    if (shown) return { shown, landed: false };
    if (!(await loginFormOpen(page))) {
      const title = openedScreenTitle(text);
      if (title) return { shown: title, landed: true };
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`화면에 "${label}" 가 보이지 않습니다.`);
}

async function showOutcome(page: Page, title: string, detail: string): Promise<void> {
  const isPass = title === "통과";
  await page.evaluate(({ title, detail, isPass }) => {
    // HUD 상태 업데이트
    const dot = document.getElementById("testflow-hud-dot");
    if (dot) {
      dot.style.animation = "none";
      dot.style.background = isPass ? "#34d399" : "#f87171";
      dot.style.boxShadow = isPass ? "0 0 10px rgba(52,211,153,0.8)" : "0 0 10px rgba(248,113,113,0.8)";
    }
    const action = document.getElementById("testflow-hud-action");
    if (action) {
      action.style.color = isPass ? "#6ee7b7" : "#fca5a5";
      action.style.fontWeight = "600";
      action.textContent = `${isPass ? "✓ " : "✗ "} ${detail}`;
    }
    // 하단 결과 바
    document.getElementById("testflow-report")?.remove();
    const bar = document.createElement("div");
    bar.id = "testflow-report";
    bar.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "padding:14px 18px",
      "display:flex",
      "align-items:center",
      "gap:10px",
      isPass ? "background:rgba(6,78,59,0.95)" : "background:rgba(69,10,10,0.95)",
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)",
      isPass ? "border:1px solid rgba(52,211,153,0.35)" : "border:1px solid rgba(248,113,113,0.35)",
      "color:#f8fafc",
      "font:15px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "border-radius:12px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
      "animation:tf-slidein 0.25s cubic-bezier(0.16,1,0.3,1)",
    ].join(";");
    const icon = document.createElement("span");
    icon.style.cssText = `font-size:20px;flex-shrink:0;color:${isPass ? "#34d399" : "#f87171"};`;
    icon.textContent = isPass ? "✔️" : "❌";
    const text = document.createElement("div");
    text.innerHTML = `<div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;opacity:0.7;margin-bottom:2px">${title}</div><div style="font-size:14px">${detail}</div>`;
    bar.append(icon, text);
    document.body.append(bar);
  }, { title, detail, isPass });
  await page.waitForTimeout(2200);
}

export async function runTestCase(options: {
  startUrl: string;
  testCase: TestCase;
  values: Record<string, string>;
  login?: { email: string; password: string };
  signal: AbortSignal;
  onLog: (entry: RunLog) => void;
}): Promise<void> {
  const log = (message: string) => options.onLog({ message, at: new Date().toISOString() });
  const inputs = valuesForCase(options.testCase, options.values);
  delete process.env.PWDEBUG;
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // log + HUD 업데이트를 동시에 수행하는 래퍼
  const liveLog = (message: string) => {
    log(message);
    setHudAction(page, message);
  };
  let closing = false;
  let browserGone = false;
  browser.on("disconnected", () => {
    if (!closing) browserGone = true;
  });
  // 즉시 닫기 (abort / 에러 시)
  const close = async () => {
    closing = true;
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  };
  // 정상 종료 시: 화면에 종료 안내 오버레이를 띄우고 3초 카운트다운 후 닫기
  const gracefulClose = async () => {
    try {
      // DOM 오버레이로 종료 안내 표시 (alert/confirm은 Playwright가 자동 dismiss하므로 사용 불가)
      await page.evaluate(() => {
        const overlay = document.createElement("div");
        overlay.id = "__tf_close_overlay";
        Object.assign(overlay.style, {
          position: "fixed",
          inset: "0",
          zIndex: "2147483647",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(4px)",
        });
        const box = document.createElement("div");
        Object.assign(box.style, {
          background: "#1e293b",
          color: "#f1f5f9",
          borderRadius: "16px",
          padding: "36px 48px",
          textAlign: "center",
          fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          minWidth: "320px",
        });
        const title = document.createElement("div");
        title.textContent = "✅ 테스트가 종료되었습니다";
        Object.assign(title.style, { fontSize: "20px", fontWeight: "700", marginBottom: "12px" });
        const sub = document.createElement("div");
        sub.id = "__tf_countdown";
        sub.textContent = "3초 후 브라우저가 닫힙니다…";
        Object.assign(sub.style, { fontSize: "15px", color: "#94a3b8" });
        box.appendChild(title);
        box.appendChild(sub);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        let remaining = 3;
        const interval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(interval);
            sub.textContent = "브라우저를 닫는 중…";
          } else {
            sub.textContent = `${remaining}초 후 브라우저가 닫힙니다…`;
          }
        }, 1_000);
      });
      await page.waitForTimeout(3_000);
    } catch {
      // 페이지가 이미 닫혀 있으면 무시
    }
    await close();
  };
  if (options.signal.aborted) {
    await close();
    throw new Error("사용자가 중지했습니다.");
  }
  const onAbort = () => {
    void close();
  };
  options.signal.addEventListener("abort", onAbort, { once: true });
  try {
    await page.goto(options.startUrl, { waitUntil: "domcontentloaded" });
    await ensureCursor(page);
    await ensureHud(page, options.testCase.title);
    await page.locator("input, button").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    liveLog(`시작 URL: ${options.startUrl}`);
    if (!isLoginCase(options.testCase)) {
      const caseReady = options.testCase.buttonName ? await hasButton(page, options.testCase.buttonName) : false;
      const loginVisible = (await loginFormOpen(page)) || (!caseReady && (await waitForLoginForm(page, 4_000)));
      if (loginVisible) {
        const login = options.login;
        if (!login?.email.trim() || !login.password.trim())
          throw new Error("로그인 화면입니다. 실행 칸에 계정과 비밀번호를 넣고 다시 실행하세요.");
        await signInWithSharedAccount(page, login, options.startUrl, liveLog, options.testCase.title);
      }
    }
    for (const input of inputs) {
      if (options.signal.aborted || browserGone) throw new Error("사용자가 중지했습니다.");
      await applyFieldValue(page, input, liveLog, (locator) => pointAt(page, locator));
      await page.waitForTimeout(250);
    }
    if (options.signal.aborted || browserGone) throw new Error("사용자가 중지했습니다.");
    if (options.testCase.buttonName) {
      const button = await locateButton(page, options.testCase.buttonName);
      const point = await pointAt(page, button);
      liveLog(`${options.testCase.buttonName} 버튼을 가리킴`);
      await page.waitForTimeout(250);
      try {
        await button.click({ timeout: 3000 });
      } catch {
        await page.mouse.click(point.x, point.y);
      }
      liveLog(`${options.testCase.buttonName} 버튼을 누름`);
      await page.waitForTimeout(200);
    }
    const phrases = phrasesToFind(options.testCase.expectedText);
    const phrase = phrases[0] ?? options.testCase.expectedText.trim();
    log(`기대 문구 확인: "${phrase}"`);
    if (options.testCase.kind === "success") {
      const landed = await waitForSuccessScreen(page, phrases);
      log(
        landed.landed
          ? `기획서의 "${phrase}" 대신 화면 "${landed.shown}" 이 열렸습니다.`
          : `화면에 "${landed.shown}" 이 보입니다.`,
      );
      await showOutcome(page, "통과", landed.shown);
    } else {
      const shown = await waitForShownPhrase(page, phrases);
      log(`화면에 "${shown}" 이 보입니다.`);
      await showOutcome(page, "통과", shown);
    }
  } catch (error) {
    if (options.signal.aborted) throw new Error("사용자가 중지했습니다.");
    const message = readableRunError(error, options.testCase.expectedText);
    await showOutcome(page, "실패", message).catch(() => undefined);
    throw new Error(message);
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    // abort(중지) 또는 에러로 인한 종료는 즉시 닫기, 정상 종료는 안내 후 닫기
    if (options.signal.aborted) {
      await close();
    } else {
      await gracefulClose();
    }
  }
}
