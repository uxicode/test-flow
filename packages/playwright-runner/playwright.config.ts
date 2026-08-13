import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const artifactsRoot = process.env.ARTIFACTS_DIR ?? path.join(__dirname, "artifacts");

export default defineConfig({
  testDir: process.env.TEST_DIR ?? "./tests",
  outputDir: path.join(artifactsRoot, "test-results"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(artifactsRoot, "playwright-report") }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    viewport: null,
    deviceScaleFactor: undefined,
    headless: process.env.HEADLESS === "true" ? true : false,
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? 300),
      args: ["--start-maximized"],
    },
    trace: "on",
    screenshot: "only-on-failure",
    video:
      process.env.TESTFLOW_RUN_VIDEO === "always" ? "on" : "retain-on-failure",
  },
});
