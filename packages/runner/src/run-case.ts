import type { TestCase } from "@testflow/tc";
import { chromium, type Locator, type Page } from "playwright";
import { needsSharedLogin, valuesForCase } from "./case-values.js";
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

async function locateButton(page: Page, name: string): Promise<Locator> {
  const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const found = await firstVisible([
    page.getByRole("button", { name: pattern }),
    page.getByRole("link", { name: pattern }),
    page.locator('input[type="submit"]'),
  ]);
  if (!found) throw new Error(`${name} 버튼을 찾지 못했습니다.`);
  return found;
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
  await page.mouse.click(point.x, point.y);
  await field.pressSequentially(value, { delay: 70 });
  log(`${target} 입력란에 값을 넣습니다.`);
}

async function ensureCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("testflow-cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "testflow-cursor";
    cursor.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "z-index:2147483647",
      "width:18px",
      "height:18px",
      "margin:-2px 0 0 -2px",
      "border:3px solid #fff",
      "border-radius:999px",
      "background:#e11d48",
      "box-shadow:0 0 0 1px #e11d48",
      "pointer-events:none",
      "transform:translate(24px, 24px)",
    ].join(";");
    document.documentElement.append(cursor);
  });
}

async function pointAt(page: Page, locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await locator.boundingBox();
  if (!box) throw new Error("대상 위치를 찾지 못했습니다.");
  const x = box.x + Math.min(box.width / 2, 48);
  const y = box.y + box.height / 2;
  const start = await page.evaluate(() => {
    const cursor = document.getElementById("testflow-cursor");
    const match = cursor?.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/u);
    return { x: Number(match?.[1] ?? 24), y: Number(match?.[2] ?? 24) };
  });
  const steps = 28;
  for (let step = 1; step <= steps; step += 1) {
    const nextX = start.x + ((x - start.x) * step) / steps;
    const nextY = start.y + ((y - start.y) * step) / steps;
    await page.mouse.move(nextX, nextY);
    await page.evaluate(({ nextX, nextY }) => {
      const cursor = document.getElementById("testflow-cursor");
      if (cursor) cursor.style.transform = `translate(${nextX}px, ${nextY}px)`;
    }, { nextX, nextY });
  }
  await locator.evaluate((element) => {
    element.style.outline = "3px solid #e11d48";
    element.style.outlineOffset = "2px";
  }).catch(() => undefined);
  await page.waitForTimeout(350);
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
  await page.evaluate(({ title, detail }) => {
    document.getElementById("testflow-report")?.remove();
    const bar = document.createElement("div");
    bar.id = "testflow-report";
    bar.textContent = `${title} — ${detail}`;
    bar.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "padding:16px 18px",
      "background:#0f172a",
      "color:#f8fafc",
      "font:16px/1.45 sans-serif",
      "border-radius:12px",
      "box-shadow:0 8px 24px rgba(0,0,0,.35)",
    ].join(";");
    document.body.append(bar);
  }, { title, detail });
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
  const browser = await chromium.launch({ headless: false, slowMo: 40 });
  const context = await browser.newContext();
  const page = await context.newPage();
  let closing = false;
  let browserGone = false;
  browser.on("disconnected", () => {
    if (!closing) browserGone = true;
  });
  const close = async () => {
    closing = true;
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
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
    await page.locator("input, button").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    log(`시작 URL: ${options.startUrl}`);
    if (needsSharedLogin(options.testCase, options.login) && (await loginFormOpen(page))) {
      const login = options.login;
      if (!login) throw new Error("공통 계정이 없습니다.");
      log("공통 계정으로 로그인");
      await typeInto(page, "이메일", login.email, log);
      await typeInto(page, "비밀번호", login.password, log);
      const button = await locateButton(page, "로그인");
      const point = await pointAt(page, button);
      log("로그인 버튼을 가리킴");
      await page.mouse.click(point.x, point.y);
      log("로그인 버튼을 누름");
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (await loginFormOpen(page))) await page.waitForTimeout(300);
      if (await loginFormOpen(page)) throw new Error("공통 계정으로 로그인하지 못했습니다.");
    }
    for (const input of inputs) {
      if (options.signal.aborted || browserGone) throw new Error("사용자가 중지했습니다.");
      await typeInto(page, input.target, input.value, log);
    }
    if (options.signal.aborted || browserGone) throw new Error("사용자가 중지했습니다.");
    if (options.testCase.buttonName) {
      const button = await locateButton(page, options.testCase.buttonName);
      const point = await pointAt(page, button);
      log(`${options.testCase.buttonName} 버튼을 가리킴`);
      await page.mouse.click(point.x, point.y);
      log(`${options.testCase.buttonName} 버튼을 누름`);
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
    await close();
  }
}
