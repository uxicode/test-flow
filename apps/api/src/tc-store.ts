import fs from "node:fs/promises";
import path from "node:path";
import type { TcDocument } from "@testflow/tc-generator";
import { DATA_DIR_NAMES, resolveDataDir } from "@testflow/shared";
import { dataRoot } from "./data-root.js";

function tcDir(): string {
  return resolveDataDir(dataRoot(), DATA_DIR_NAMES.tc);
}

function filePath(documentId: string): string {
  return path.join(tcDir(), `${documentId}.json`);
}

export async function saveTcDocument(doc: TcDocument): Promise<void> {
  await fs.mkdir(tcDir(), { recursive: true });
  await fs.writeFile(filePath(doc.documentId), `${JSON.stringify(doc, null, 2)}\n`);
}

export async function getTcDocument(documentId: string): Promise<TcDocument | null> {
  try {
    const raw = await fs.readFile(filePath(documentId), "utf8");
    return JSON.parse(raw) as TcDocument;
  } catch {
    return null;
  }
}

export async function deleteTcDocument(documentId: string): Promise<boolean> {
  if (!/^[\w.-]+$/.test(documentId)) return false;
  try {
    await fs.unlink(filePath(documentId));
    return true;
  } catch {
    return false;
  }
}

export async function listTcDocuments(): Promise<TcDocument[]> {
  await fs.mkdir(tcDir(), { recursive: true });
  const names = await fs.readdir(tcDir());
  const docs: TcDocument[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const raw = await fs.readFile(path.join(tcDir(), name), "utf8");
    docs.push(JSON.parse(raw) as TcDocument);
  }
  return docs;
}
