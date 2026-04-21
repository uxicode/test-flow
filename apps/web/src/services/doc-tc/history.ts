import type {
  DocTcOptions,
  DocTcResult,
  GeneratedDocTestCase,
  RequirementItem,
  SourceDocumentRef,
} from "./types";

const STORAGE_KEY = "testflow:docTc:history:v1";
const MAX_ENTRIES = 20;

export interface DocTcHistoryEntry {
  id: string;
  createdAt: string;
  document: SourceDocumentRef;
  options: DocTcOptions;
  requirements: RequirementItem[];
  testCases: GeneratedDocTestCase[];
  warnings: string[];
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    const probeKey = "__testflow_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

function generateId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isDocTcHistoryEntry(value: unknown): value is DocTcHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DocTcHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    !!entry.document &&
    typeof entry.document === "object" &&
    !!entry.options &&
    typeof entry.options === "object" &&
    Array.isArray(entry.requirements) &&
    Array.isArray(entry.testCases) &&
    Array.isArray(entry.warnings)
  );
}

function readAll(): DocTcHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDocTcHistoryEntry);
  } catch {
    return [];
  }
}

function writeAll(entries: DocTcHistoryEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 용량 초과 등 저장 실패 시 조용히 무시한다.
  }
}

function sortByCreatedAtDesc(
  entries: DocTcHistoryEntry[],
): DocTcHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0;
    return a.createdAt > b.createdAt ? -1 : 1;
  });
}

export function isDocTcHistoryAvailable(): boolean {
  return getStorage() !== null;
}

export function listDocTcHistory(): DocTcHistoryEntry[] {
  return sortByCreatedAtDesc(readAll());
}

export function saveDocTcHistory(
  result: DocTcResult,
  options: DocTcOptions,
): DocTcHistoryEntry | null {
  if (!getStorage()) return null;
  const entry: DocTcHistoryEntry = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    document: result.document,
    options: { ...options },
    requirements: result.requirements,
    testCases: result.testCases,
    warnings: result.warnings,
  };
  const next = sortByCreatedAtDesc([entry, ...readAll()]).slice(0, MAX_ENTRIES);
  writeAll(next);
  return entry;
}

export function deleteDocTcHistory(id: string): DocTcHistoryEntry[] {
  const next = readAll().filter((entry) => entry.id !== id);
  writeAll(next);
  return sortByCreatedAtDesc(next);
}

export function clearDocTcHistory(): void {
  writeAll([]);
}
