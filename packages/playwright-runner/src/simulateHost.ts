/// <reference lib="dom" />
/**
 * Headed Playwright Simulator Runner:
 * Spawns a real Chromium browser window (headless: false) and executes scenario builder steps
 * sequentially with smooth virtual cursor movements, click ripples, and real-time console debugging.
 *
 * Usage: npx tsx simulateHost.ts <sessionDir> <startUrl>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

interface Step {
  id: string;
  type: string;
  selectorStrategy?: string;
  selectorValue?: string;
  role?: string;
  inputValue?: string;
  waitMs?: number;
  label?: string;
}

const sessionDir = process.argv[2];
const startUrl = process.argv[3];

if (!sessionDir || !startUrl) {
  console.error("usage: simulateHost <sessionDir> <startUrl>");
  process.exit(1);
}

function emitStatus(prefix: "TFSTEP_ACTIVE" | "TFSTEP_DONE" | "TFERROR", data: object): void {
  process.stdout.write(`${prefix} ${JSON.stringify(data)}\n`);
}

async function injectVirtualCursorScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__tf_cursor_pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  });
}

async function resolveLocator(page: Page, step: Step) {
  const val = step.selectorValue ?? "";
  const strat = step.selectorStrategy ?? "css";
  const role = (step.role ?? "button") as any;

  if (!val) return page.locator("body");

  switch (strat) {
    case "text":
      return page.getByText(val).first();
    case "role":
      return page.getByRole(role, { name: val }).first();
    case "label":
      return page.getByLabel(val).first();
    case "placeholder":
      return page.getByPlaceholder(val).first();
    case "testid":
      return page.getByTestId(val).first();
    case "css":
    default:
      return page.locator(val).first();
  }
}

async function animateCursorAndInteract(page: Page, step: Step): Promise<void> {
  const locatorStr = step.selectorValue ?? "";
  const strategy = step.selectorStrategy ?? "css";
  const role = step.role ?? "button";

  await page.evaluate(async ({ locStr, strat, roleVal, stepType, val }) => {
    let cursor = document.getElementById("tf-virtual-cursor");
    if (!cursor) {
      const style = document.createElement("style");
      style.id = "tf-cursor-styles";
      style.textContent = `
        #tf-virtual-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 26px;
          height: 26px;
          pointer-events: none;
          z-index: 9999999;
          transform: translate(-100px, -100px);
          transition: transform 0.03s linear;
        }
        .tf-click-ripple {
          position: absolute;
          top: -12px;
          left: -12px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(14, 165, 233, 0.35);
          border: 2px solid rgba(14, 165, 233, 0.9);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
          animation: tf-ping 0.45s cubic-bezier(0, 0, 0.2, 1) forwards;
        }
        @keyframes tf-ping {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      cursor = document.createElement("div");
      cursor.id = "tf-virtual-cursor";
      cursor.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));">
          <path d="M5.5 3.5L18.5 11.5L12 13.5L9.5 20.5L5.5 3.5Z" fill="#0EA5E9" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <div id="tf-ripple-container"></div>
      `;
      document.body.appendChild(cursor);
      window.__tf_cursor_pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    let el: Element | null = null;
    if (locStr) {
      try {
        if (strat === "css") el = document.querySelector(locStr);
        else if (strat === "text") {
          const candidates = Array.from(document.querySelectorAll("*"));
          el = candidates.find((c) => (c.textContent || "").trim() === locStr) || null;
        } else if (strat === "placeholder") {
          el = document.querySelector(`[placeholder="${locStr}"]`);
        }
      } catch (e) {}

      if (!el) {
        const cleanVal = locStr.replace(/["']/g, "");
        const candidates = Array.from(
          document.querySelectorAll("button, a, input, select, label, [role='button']")
        );
        el =
          candidates.find(
            (c) =>
              (c.getAttribute("placeholder") || "").includes(cleanVal) ||
              (c.textContent || "").includes(cleanVal)
          ) || null;
      }
    }

    if (!el) return;

    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;

    const startPos = window.__tf_cursor_pos || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const startX = startPos.x;
    const startY = startPos.y;

    const stepsCount = 18;
    for (let i = 1; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const ease = t * t * (3 - 2 * t);
      const curX = startX + (targetX - startX) * ease;
      const curY = startY + (targetY - startY) * ease;
      cursor.style.transform = "translate(" + curX + "px, " + curY + "px)";
      window.__tf_cursor_pos = { x: curX, y: curY };
      await new Promise((r) => setTimeout(r, 16));
    }

    const container = document.getElementById("tf-ripple-container");
    if (container) {
      const ripple = document.createElement("div");
      ripple.className = "tf-click-ripple";
      container.appendChild(ripple);
      setTimeout(() => ripple.remove(), 450);
    }
  }, { locStr: locatorStr, strat: strategy, roleVal: role, stepType: step.type, val: step.inputValue });
}

async function main() {
  console.log(`[simulateHost Debugger] Starting heated Chromium simulator in ${sessionDir} @ ${startUrl}`);

  let steps: Step[] = [];
  const stepsJsonPath = path.join(sessionDir, "steps.json");
  try {
    const content = await fs.readFile(stepsJsonPath, "utf-8");
    steps = JSON.parse(content);
  } catch (e) {
    console.log("[simulateHost Debugger] No steps.json found, running empty session.");
  }

  const videoDir = path.join(sessionDir, "video");
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 350,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });

  const page = await context.newPage();
  await injectVirtualCursorScript(page);

  page.on("console", (msg) => {
    console.log(`[Browser Console ${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on("requestfailed", (req) => {
    console.log(`[Browser Network Failed] ${req.method()} ${req.url()} (${req.failure()?.errorText})`);
  });

  console.log(`[simulateHost Debugger] Navigating to start URL: ${startUrl}`);
  await page.goto(startUrl).catch((err) => console.log(`[simulateHost Debugger] Navigation error: ${err.message}`));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    emitStatus("TFSTEP_ACTIVE", { index: i, stepId: step.id, label: step.label || step.selectorValue });
    console.log(`[simulateHost Debugger Step ${i + 1}/${steps.length}] type=${step.type} strat=${step.selectorStrategy ?? "css"} val="${step.selectorValue ?? ""}"`);

    try {
      if (step.type === "goto" && step.selectorValue) {
        await page.goto(step.selectorValue).catch(() => {});
      } else if (step.type === "wait_ms") {
        await page.waitForTimeout(step.waitMs ?? 1000);
      } else if (step.type === "click") {
        await animateCursorAndInteract(page, step);
        const loc = await resolveLocator(page, step);
        await loc.click({ force: true, timeout: 5000 }).catch(() => {});
      } else if (step.type === "fill") {
        await animateCursorAndInteract(page, step);
        const loc = await resolveLocator(page, step);
        await loc.fill(step.inputValue ?? "").catch(() => {});
      } else if (step.type === "check") {
        await animateCursorAndInteract(page, step);
        const loc = await resolveLocator(page, step);
        await loc.check({ force: true }).catch(() => {});
      } else if (step.type === "assert_visible") {
        const loc = await resolveLocator(page, step);
        const visible = await loc.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`[simulateHost Debugger Assert] visible check "${step.selectorValue}" -> ${visible}`);
      }

      await page.waitForTimeout(600);
    } catch (err: any) {
      console.log(`[simulateHost Debugger Step Error] ${err.message}`);
    }
  }

  emitStatus("TFSTEP_DONE", { total: steps.length });
  console.log("[simulateHost Debugger] Simulation completed. Keeping browser open for active debugging...");

  await new Promise((r) => page.on("close", r));
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error("[simulateHost Fatal Error]", err);
  process.exit(1);
});
