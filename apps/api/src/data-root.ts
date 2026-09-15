import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_DIR_NAMES,
  resolveDataDir,
  resolveDataRoot,
  type DataDirName,
} from "@testflow/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot(): string {
  return process.env.TESTFLOW_REPO_ROOT ?? path.resolve(__dirname, "..", "..", "..");
}

export function dataRoot(): string {
  return resolveDataRoot({
    repoRoot: repoRoot(),
    envRoot: process.env.TESTFLOW_DATA_ROOT,
  });
}

export function dataDirs(): Record<DataDirName, string> {
  const root = dataRoot();
  return {
    [DATA_DIR_NAMES.figmaDumps]: resolveDataDir(root, DATA_DIR_NAMES.figmaDumps),
    [DATA_DIR_NAMES.mermaid]: resolveDataDir(root, DATA_DIR_NAMES.mermaid),
    [DATA_DIR_NAMES.tc]: resolveDataDir(root, DATA_DIR_NAMES.tc),
    [DATA_DIR_NAMES.runs]: resolveDataDir(root, DATA_DIR_NAMES.runs),
  };
}

export async function ensureDataDirs(): Promise<Record<DataDirName, string>> {
  const dirs = dataDirs();
  await Promise.all(
    Object.values(dirs).map((dir) => fs.mkdir(dir, { recursive: true })),
  );
  return dirs;
}
