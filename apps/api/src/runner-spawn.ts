import { spawn, type SpawnOptions } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { accessSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function pathKey(): "PATH" | "Path" {
  return process.platform === "win32" ? "Path" : "PATH";
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function binName(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function repoRootFromRunner(runnerRoot: string): string {
  return (
    process.env.TESTFLOW_REPO_ROOT ??
    path.resolve(runnerRoot, "..", "..")
  );
}

function collectBinDirs(runnerRoot: string): string[] {
  const repoRoot = repoRootFromRunner(runnerRoot);
  const dirs = [
    path.join(runnerRoot, "node_modules", ".bin"),
    path.join(repoRoot, "node_modules", ".bin"),
    path.dirname(process.execPath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];

  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    dirs.push(
      path.join(home, ".nvm", "versions", "node", process.version, "bin"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".local", "share", "fnm", "current", "bin"),
    );
  }

  const pathEntries = (process.env[pathKey()] ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of pathEntries) {
    dirs.push(entry);
  }

  return [...new Set(dirs.filter((dir) => existsSync(dir)))];
}

export function buildRunnerSpawnEnv(
  runnerRoot: string,
  extraEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
  };

  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const key = pathKey();
  const merged = [...collectBinDirs(runnerRoot), env[key] ?? ""]
    .filter(Boolean)
    .join(path.delimiter);
  env[key] = merged;

  const repoRoot = repoRootFromRunner(runnerRoot);
  const nodePaths = [
    path.join(runnerRoot, "node_modules"),
    path.join(repoRoot, "node_modules"),
    env.NODE_PATH ?? "",
  ].filter(Boolean);
  env.NODE_PATH = nodePaths.join(path.delimiter);

  return env;
}

export function getNodeExecutable(): string {
  return process.execPath;
}

function resolveFromRunner(runnerRoot: string, spec: string): string {
  const pkgJson = path.resolve(runnerRoot, "package.json");
  const require = createRequire(pkgJson);
  return require.resolve(spec);
}

function resolveBinTool(runnerRoot: string, name: string): string | null {
  for (const dir of collectBinDirs(runnerRoot)) {
    const candidate = path.join(dir, binName(name));
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface RunnerSpawnSpec {
  command: string;
  args: string[];
  options: SpawnOptions;
}

function baseSpawnOptions(
  runnerRoot: string,
  extraEnv?: NodeJS.ProcessEnv,
): SpawnOptions {
  return {
    cwd: runnerRoot,
    env: buildRunnerSpawnEnv(runnerRoot, extraEnv),
    shell: process.platform === "win32",
  };
}

export function spawnPlaywrightTest(
  runnerRoot: string,
  playwrightConfigPath: string,
  extraEnv?: NodeJS.ProcessEnv,
): RunnerSpawnSpec {
  const node = getNodeExecutable();
  const cli = resolveFromRunner(runnerRoot, "@playwright/test/cli");
  return {
    command: node,
    args: [cli, "test", "--config", playwrightConfigPath, "--headed"],
    options: {
      ...baseSpawnOptions(runnerRoot, extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
    },
  };
}

export function spawnPlaywrightCodegen(
  runnerRoot: string,
  url: string,
  outputPath: string,
): RunnerSpawnSpec {
  const bin = resolveBinTool(runnerRoot, "playwright");
  if (bin) {
    return {
      command: bin,
      args: ["codegen", url, "--output", outputPath],
      options: {
        ...baseSpawnOptions(runnerRoot),
        stdio: "ignore",
      },
    };
  }

  const node = getNodeExecutable();
  const cli = resolveFromRunner(runnerRoot, "@playwright/test/cli");
  return {
    command: node,
    args: [cli, "codegen", url, "--output", outputPath],
    options: {
      ...baseSpawnOptions(runnerRoot),
      stdio: "ignore",
    },
  };
}

export function spawnRecordHost(
  runnerRoot: string,
  sessionDir: string,
  url: string,
): RunnerSpawnSpec {
  const recordHost = path.join(runnerRoot, "src", "recordHost.ts");
  const node = getNodeExecutable();
  const tsxCli = resolveFromRunner(runnerRoot, "tsx/cli");

  return {
    command: node,
    args: [tsxCli, recordHost, sessionDir, url],
    options: {
      ...baseSpawnOptions(runnerRoot),
      stdio: ["ignore", "pipe", "pipe"],
    },
  };
}

export function spawnPlaywrightInstallChromium(runnerRoot: string): RunnerSpawnSpec {
  const bin = resolveBinTool(runnerRoot, "playwright");
  if (bin && isExecutable(bin)) {
    return {
      command: bin,
      args: ["install", "chromium"],
      options: {
        ...baseSpawnOptions(runnerRoot),
        stdio: "inherit",
      },
    };
  }

  const node = getNodeExecutable();
  const cli = resolveFromRunner(runnerRoot, "@playwright/test/cli");
  return {
    command: node,
    args: [cli, "install", "chromium"],
    options: {
      ...baseSpawnOptions(runnerRoot),
      stdio: "inherit",
    },
  };
}

export function runSpawn(spec: RunnerSpawnSpec) {
  return spawn(spec.command, spec.args, spec.options);
}
