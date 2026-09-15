import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function applyTestflowEnv(): void {
  if (app.isPackaged) {
    const userData = app.getPath("userData");
    process.env.TESTFLOW_DATA_ROOT = userData;
    process.env.TESTFLOW_REPO_ROOT = userData;
    process.env.TESTFLOW_WEB_DIST_DIR = path.join(
      process.resourcesPath,
      "web-dist",
    );
    return;
  }

  const monorepoRoot = path.resolve(__dirname, "..", "..", "..");
  process.env.TESTFLOW_REPO_ROOT = monorepoRoot;
  process.env.TESTFLOW_DATA_ROOT = path.join(monorepoRoot, "data");
  process.env.TESTFLOW_WEB_DIST_DIR = path.join(
    monorepoRoot,
    "apps",
    "web",
    "dist",
  );
}

async function createWindow(): Promise<void> {
  applyTestflowEnv();

  const { startServer } = await import("@testflow/api");
  const port = Number(process.env.PORT ?? 3001);
  await startServer({ port, host: "127.0.0.1" });

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(() => {
  void createWindow().catch((err) => {
    console.error("[TestFlow] failed to start", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0)
    void createWindow().catch((err) => console.error(err));
});
