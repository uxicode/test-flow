/// <reference lib="dom" />
/**
 * Headed Playwright session: recordVideo + trace + DOM event → steps.json
 * Spawned by API: npx tsx recordHost.ts <sessionDir> <startUrl>
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

type SelectorStrategy = "text" | "role" | "label" | "placeholder" | "css" | "testid";

interface StepOut {
  id: string;
  type: string;
  selectorStrategy?: SelectorStrategy;
  selectorValue?: string;
  role?: string;
  inputValue?: string;
  waitMs?: number;
  label?: string;
}

interface QueuedEvent {
  kind: string;
  strategy?: string;
  value?: string;
  role?: string;
  text?: string;
}

const sessionDir = process.argv[2];
const startUrl = process.argv[3];

if (!sessionDir || !startUrl) {
  console.error("usage: recordHost <sessionDir> <startUrl>");
  process.exit(1);
}

function newStep(type: StepOut["type"], partial: Partial<StepOut> = {}): StepOut {
  return {
    id: randomUUID().slice(0, 8),
    type,
    selectorStrategy: "css",
    selectorValue: "",
    role: "button",
    inputValue: "",
    waitMs: 1000,
    label: "",
    ...partial,
  };
}

function handleEvent(steps: StepOut[], ev: QueuedEvent): void {
  if (ev.kind === "__init__") {
    console.log(`[tfRecord] initScript OK @ ${ev.value}`);
    return;
  }
  if ((ev.kind === "click" || ev.kind === "mousedown") && ev.strategy && ev.value != null) {
    const last = steps[steps.length - 1];
    if (last?.type === "click" && last.selectorValue === ev.value) return;
    steps.push(
      newStep("click", {
        selectorStrategy: ev.strategy as SelectorStrategy,
        selectorValue: ev.value,
        role: ev.role ?? "button",
      }),
    );
    console.log(`[tfRecord] click(${ev.kind}): ${ev.strategy}="${ev.value}"`);
  } else if (ev.kind === "fill" && ev.strategy && ev.value != null) {
    const text = ev.text ?? "";
    const last = steps[steps.length - 1];
    if (last?.type === "fill" && last.selectorValue === ev.value) {
      last.inputValue = text;
    } else {
      steps.push(
        newStep("fill", {
          selectorStrategy: ev.strategy as SelectorStrategy,
          selectorValue: ev.value,
          role: ev.role ?? "textbox",
          inputValue: text,
        }),
      );
      console.log(`[tfRecord] fill: ${ev.strategy}="${ev.value}"`);
    }
  }
}

async function drainAllFrames(p: Page, steps: StepOut[]): Promise<void> {
  for (const frame of p.frames()) {
    try {
      const events = (await frame.evaluate(() => {
        const w = window as Window & { __tfQueue?: object[] };
        if (!w.__tfQueue || w.__tfQueue.length === 0) return [];
        return w.__tfQueue.splice(0);
      })) as QueuedEvent[];
      for (const ev of events) handleEvent(steps, ev);
    } catch {
      /* 네비게이션 중 에러 무시 */
    }
  }
}

// 이벤트 캡처 스크립트 — page.evaluate로 직접 주입 (addInitScript 보완)
const CAPTURE_SCRIPT = /* js */ `(function(){
  var w = window;
  if (w.__tfListening) return;
  w.__tfListening = true;
  w.__tfQueue = w.__tfQueue || [];
  w.__tfQueue.push({ kind: '__init__', value: location.href.slice(0, 80) });

  function pickTarget(el) {
    if (!el) return null;
    return el.closest('button,a,input,textarea,select,[role="button"],[role="link"],[role="checkbox"],[role="tab"],[role="menuitem"],[role="option"],[role="gridcell"],[role="cell"],[role="row"]') || el;
  }

  function describe(el) {
    var e = pickTarget(el);
    if (!e) return null;
    var tag = e.tagName.toLowerCase();
    var tid = e.getAttribute('data-testid');
    if (tid) return { strategy: 'testid', value: tid, role: tag === 'input' ? 'textbox' : 'button' };
    var ph = e.placeholder;
    if (ph && (tag === 'input' || tag === 'textarea')) return { strategy: 'placeholder', value: ph, role: 'textbox' };
    var lab = e.getAttribute('aria-label');
    if (lab) return { strategy: 'label', value: lab, role: e.getAttribute('role') || 'button' };
    var roleAttr = e.getAttribute('role');
    var name = (e.innerText || '').trim().slice(0, 120) || e.getAttribute('title') || '';
    if (roleAttr && name) return { strategy: 'role', value: name, role: roleAttr };
    if (name && (tag === 'button' || tag === 'a')) return { strategy: 'text', value: name.slice(0, 80), role: tag === 'a' ? 'link' : 'button' };
    if (e.id) return { strategy: 'css', value: '#' + e.id, role: roleAttr || 'button' };
    var cls = (e.getAttribute('class') || '').split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
    return { strategy: 'css', value: cls ? tag + '.' + cls : tag, role: roleAttr || 'button' };
  }

  window.addEventListener('click', function(ev) {
    try { var d = describe(ev.target); if (d) w.__tfQueue.push(Object.assign({ kind: 'click' }, d)); } catch(e) {}
  }, true);

  window.addEventListener('mousedown', function(ev) {
    try {
      var t = ev.target;
      if (!t) return;
      var tag = (t.tagName || '').toLowerCase();
      var isInteractive = ['button','a','input','textarea','select'].indexOf(tag) !== -1
        || !!t.closest('button,a,[role="button"],[role="link"],[role="tab"],[role="menuitem"]');
      if (!isInteractive) return;
      var d = describe(t);
      if (d) w.__tfQueue.push(Object.assign({ kind: 'mousedown' }, d));
    } catch(e) {}
  }, true);

  window.addEventListener('input', function(ev) {
    try {
      var t = ev.target;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
      var d = describe(t);
      if (d) w.__tfQueue.push(Object.assign({ kind: 'fill' }, d, { text: t.value }));
    } catch(e) {}
  }, true);
})();`;

async function injectListeners(p: Page): Promise<void> {
  try {
    await p.evaluate(CAPTURE_SCRIPT);
    console.log("[tfRecord] listeners injected");
  } catch {
    /* 무시 */
  }
}

function startPolling(p: Page, steps: StepOut[]): ReturnType<typeof setInterval> {
  let pollCount = 0;
  return setInterval(async () => {
    if (pollCount < 5) {
      pollCount++;
      try {
        const debug = await p.evaluate(() => ({
          hasQueue: "__tfQueue" in window,
          listening: "__tfListening" in window,
          queueLen: (window as Window & { __tfQueue?: object[] }).__tfQueue?.length ?? -1,
          url: location.href.slice(0, 80),
        }));
        console.log(`[debug#${pollCount}] ${JSON.stringify(debug)}`);
      } catch (e) {
        console.log(`[debug#${pollCount}] err: ${String(e).slice(0, 80)}`);
      }
    }
    await drainAllFrames(p, steps);
  }, 400);
}

async function main(): Promise<void> {
  const steps: StepOut[] = [];
  let lastUrl = "";
  const intervals: ReturnType<typeof setInterval>[] = [];

  const browser = await chromium.launch({ headless: false });
  const videoDir = path.join(sessionDir, "video");
  await fs.mkdir(videoDir, { recursive: true });

  const context = await browser.newContext({
    recordVideo: { dir: videoDir },
    // CSP 우회: addInitScript/evaluate 가 CSP에 막히지 않도록
    bypassCSP: true,
  });
  await context.tracing.start({ screenshots: true, snapshots: true });

  // addInitScript: 순수 JS로 작성 (TypeScript 타입 제거) — tsx 컴파일 의존 없음
  await context.addInitScript(CAPTURE_SCRIPT);

  function onNav(p: Page): void {
    p.on("framenavigated", (frame) => {
      if (frame !== p.mainFrame()) return;
      const u = frame.url();
      if (!u || u === "about:blank") return;
      if (u === lastUrl) return;
      lastUrl = u;
      steps.push(newStep("goto", { selectorStrategy: "css", selectorValue: u, role: "button" }));
      console.log(`[tfRecord] goto: ${u.slice(0, 80)}`);
    });

    // 페이지 로드 완료 시 리스너 재주입 (addInitScript 보완)
    p.on("load", () => void injectListeners(p));
  }

  const page = await context.newPage();
  onNav(page);
  intervals.push(startPolling(page, steps));

  context.on("page", (newPage) => {
    onNav(newPage);
    intervals.push(startPolling(newPage, steps));
  });

  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  console.log("[tfRecord] recording started");

  await new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve);
    process.once("SIGINT", resolve);
  });

  for (const iv of intervals) clearInterval(iv);
  await drainAllFrames(page, steps);

  console.log(`[tfRecord] stopping... captured ${steps.length} steps`);
  await context.tracing.stop({ path: path.join(sessionDir, "trace.zip") }).catch(() => {});
  await context.close();
  await browser.close();

  await fs.writeFile(path.join(sessionDir, "steps.json"), JSON.stringify(steps, null, 2), "utf8");
  console.log(`[tfRecord] steps.json saved (${steps.length} steps)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
