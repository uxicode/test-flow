import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  FigmaDump,
  FigmaDumpSummary,
  IngestSource,
  StoredFigmaDump,
} from "@testflow/figma-ingest";
import { DATA_DIR_NAMES, resolveDataDir } from "@testflow/shared";
import { dataRoot } from "./data-root.js";

function dumpsDir(): string {
  return resolveDataDir(dataRoot(), DATA_DIR_NAMES.figmaDumps);
}

function filePath(id: string): string {
  return path.join(dumpsDir(), `${id}.json`);
}

function toSummary(dump: StoredFigmaDump): FigmaDumpSummary {
  return {
    id: dump.id,
    fileKey: dump.fileKey,
    startNodeId: dump.startNodeId,
    nodeCount: dump.nodes.length,
    connectionCount: dump.connections.length,
    importedAt: dump.importedAt,
    source: dump.source,
  };
}

export async function saveDump(
  dump: FigmaDump,
  source: IngestSource,
): Promise<StoredFigmaDump> {
  await fs.mkdir(dumpsDir(), { recursive: true });
  const stored: StoredFigmaDump = {
    ...dump,
    id: randomUUID(),
    importedAt: new Date().toISOString(),
    source,
  };
  await fs.writeFile(filePath(stored.id), `${JSON.stringify(stored, null, 2)}\n`);
  return stored;
}

export async function listDumps(): Promise<FigmaDumpSummary[]> {
  await fs.mkdir(dumpsDir(), { recursive: true });
  const names = await fs.readdir(dumpsDir());
  const summaries: FigmaDumpSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const raw = await fs.readFile(path.join(dumpsDir(), name), "utf8");
    const stored = JSON.parse(raw) as StoredFigmaDump;
    summaries.push(toSummary(stored));
  }
  return summaries.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function getDump(id: string): Promise<StoredFigmaDump | null> {
  try {
    const raw = await fs.readFile(filePath(id), "utf8");
    return JSON.parse(raw) as StoredFigmaDump;
  } catch {
    return null;
  }
}

export async function deleteDump(id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false;
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch {
    return false;
  }
}
