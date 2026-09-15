import {
  RUNNER_EVENT,
  type RunnerEvent,
  type StartRunInput,
  type TestRunner,
  type Unsubscribe,
} from "@testflow/runner-contract";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { CURSOR_OVERLAY_SCRIPT } from "./cursor-overlay.js";
import { HINT_KIND, classifyHint } from "./resolve-hint.js";

interface ActiveRun {
  stopped: boolean;
}

function emit(
  listeners: Set<(event: RunnerEvent) => void>,
  event: Omit<RunnerEvent, "at">,
): void {
  const full: RunnerEvent = { ...event, at: new Date().toISOString() };
  for (const listener of listeners) listener(full);
}

async function locate(page: Page, hint: string): Promise<Locator> {
  const kind = classifyHint(hint);
  if (kind === HINT_KIND.css) return page.locator(hint).first();
  const byRole = page
    .getByRole("button", { name: hint })
    .or(page.getByRole("link", { name: hint }))
    .or(page.getByRole("textbox", { name: hint }));
  if ((await byRole.count()) > 0) return byRole.first();
  return page.getByText(hint, { exact: false }).first();
}

async function moveCursor(page: Page, locator: Locator, emitLog: (message: string) => void) {
  try {
    const box = await locator.boundingBox();
    if (!box) return;
    await page.evaluate(
      ({ x, y }) => {
        const move = (window as unknown as { __testflowMoveCursor?: (x: number, y: number) => void })
          .__testflowMoveCursor;
        if (move) move(x, y);
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    await page.waitForTimeout(180);
  } catch {
    emitLog("커서 오버레이를 그리지 못했습니다. 클릭은 계속합니다.");
  }
}

export function createPlaywrightRunner(options: { runsRoot: string }): TestRunner {
  const listeners = new Set<(event: RunnerEvent) => void>();
  const active = new Map<string, ActiveRun>();

  const runner: TestRunner = {
    subscribe(listener: (event: RunnerEvent) => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async stop(runId: string): Promise<void> {
      const run = active.get(runId);
      if (run) run.stopped = true;
    },

    async start(input: StartRunInput): Promise<void> {
      const runDir = path.join(options.runsRoot, input.runId);
      await fs.mkdir(runDir, { recursive: true });
      const state: ActiveRun = { stopped: false };
      active.set(input.runId, state);

      const log = (message: string, stepId?: string) =>
        emit(listeners, {
          type: RUNNER_EVENT.log,
          runId: input.runId,
          stepId,
          message,
        });

      let browser = null as Awaited<ReturnType<typeof chromium.launch>> | null;
      let context = null as Awaited<
        ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>
      > | null;
      let passed = true;
      let videoPath: string | null = null;

      try {
        browser = await chromium.launch({
          headless: !input.headed,
        });
        context = await browser.newContext({
          recordVideo: { dir: runDir, size: { width: 1280, height: 720 } },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(input.stepTimeoutMs);
        await page.addInitScript(CURSOR_OVERLAY_SCRIPT);

        await page.goto(input.startUrl, { waitUntil: "domcontentloaded" });
        log(`시작 URL: ${input.startUrl}`);

        for (const step of input.steps) {
          if (state.stopped) {
            passed = false;
            log("런이 중지되었습니다.", step.id);
            break;
          }
          emit(listeners, {
            type: RUNNER_EVENT.stepStarted,
            runId: input.runId,
            stepId: step.id,
            message: `${step.action} ${step.targetHint}`,
          });
          try {
            if (classifyHint(step.targetHint) === HINT_KIND.url) {
              await page.goto(step.targetHint, { waitUntil: "domcontentloaded" });
            } else {
              const locator = await locate(page, step.targetHint);
              await locator.waitFor({ state: "visible" });
              await moveCursor(page, locator, (message) => log(message, step.id));

              const action = step.action.trim();
              if (action !== "시작" && action !== "기대")
                await locator.click({ timeout: input.stepTimeoutMs });
            }

            if (step.expected.trim()) {
              const expected = page.getByText(step.expected, { exact: false }).first();
              if ((await expected.count()) > 0)
                await expected.waitFor({ state: "visible", timeout: input.stepTimeoutMs });
            }

            emit(listeners, {
              type: RUNNER_EVENT.stepPassed,
              runId: input.runId,
              stepId: step.id,
              message: "pass",
            });
          } catch (error) {
            passed = false;
            const message = error instanceof Error ? error.message : "스텝 실패";
            emit(listeners, {
              type: RUNNER_EVENT.stepFailed,
              runId: input.runId,
              stepId: step.id,
              message,
            });
            if (input.stopOnFail) {
              log("실패 후 중단", step.id);
              break;
            }
          }
        }

        const video = page.video();
        await context.close();
        context = null;
        if (video) {
          try {
            const recorded = await video.path();
            const dest = path.join(runDir, "video.webm");
            await fs.rename(recorded, dest).catch(async () => {
              await fs.copyFile(recorded, dest);
            });
            videoPath = dest;
          } catch (error) {
            log(
              `녹화 파일을 남기지 못했습니다. ${error instanceof Error ? error.message : ""}`,
            );
          }
        }
      } catch (error) {
        passed = false;
        emit(listeners, {
          type: RUNNER_EVENT.log,
          runId: input.runId,
          message: error instanceof Error ? error.message : "러너 오류",
        });
      } finally {
        if (context) await context.close().catch(() => undefined);
        if (browser) await browser.close().catch(() => undefined);
        active.delete(input.runId);
        emit(listeners, {
          type: RUNNER_EVENT.runFinished,
          runId: input.runId,
          message: videoPath
            ? `${passed ? "passed" : "failed"} video=${videoPath}`
            : passed
              ? "passed"
              : "failed",
        });
      }
    },
  };

  return runner;
}
