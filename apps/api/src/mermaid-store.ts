import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MermaidIr, MermaidIrSummary, StoredMermaidIr } from "@testflow/mermaid-ir";
import { DATA_DIR_NAMES, resolveDataDir } from "@testflow/shared";
import { dataRoot } from "./data-root.js";

function mermaidDir(): string {
  return resolveDataDir(dataRoot(), DATA_DIR_NAMES.mermaid);
}

function filePath(id: string): string {
  return path.join(mermaidDir(), `${id}.json`);
}

function toSummary(doc: StoredMermaidIr): MermaidIrSummary {
  return {
    id: doc.id,
    dumpId: doc.dumpId,
    checksum: doc.checksum,
    nodeCount: doc.nodeMap.length,
    createdAt: doc.createdAt,
  };
}

export async function saveMermaid(
  dumpId: string,
  ir: MermaidIr,
): Promise<StoredMermaidIr> {
  await fs.mkdir(mermaidDir(), { recursive: true });
  const stored: StoredMermaidIr = {
    ...ir,
    id: randomUUID(),
    dumpId,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath(stored.id), `${JSON.stringify(stored, null, 2)}\n`);
  return stored;
}

export async function listMermaid(): Promise<MermaidIrSummary[]> {
  await fs.mkdir(mermaidDir(), { recursive: true });
  const names = await fs.readdir(mermaidDir());
  const items: MermaidIrSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const raw = await fs.readFile(path.join(mermaidDir(), name), "utf8");
    items.push(toSummary(JSON.parse(raw) as StoredMermaidIr));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMermaid(id: string): Promise<StoredMermaidIr | null> {
  try {
    const raw = await fs.readFile(filePath(id), "utf8");
    return JSON.parse(raw) as StoredMermaidIr;
  } catch {
    return null;
  }
}

export async function deleteMermaid(id: string): Promise<boolean> {
  if (!/^[\w.-]+$/.test(id)) return false;
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch {
    return false;
  }
}
