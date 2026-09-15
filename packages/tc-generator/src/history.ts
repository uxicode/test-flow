import { TC_ERROR, TcError } from "./error-codes.js";
import { TC_CHANGE, type TcChangeSummary, type TcDocument, type TcVersion, type TestCase } from "./types.js";

export const TC_HISTORY_MAX = 50;

function nowIso(): string {
  return new Date().toISOString();
}

export function headVersion(doc: TcDocument): TcVersion | null {
  if (doc.versions.length === 0) return null;
  return doc.versions[doc.versions.length - 1] ?? null;
}

export function getVersion(doc: TcDocument, version: number): TcVersion {
  const found = doc.versions.find((item) => item.version === version);
  if (!found) throw new TcError(TC_ERROR.versionNotFound, String(version));
  return found;
}

function appendVersion(
  doc: TcDocument,
  input: {
    summary: TcChangeSummary;
    parentVersion: number | null;
    mermaidChecksum: string;
    cases: TestCase[];
  },
): TcDocument {
  const last = headVersion(doc);
  const next: TcVersion = {
    version: (last?.version ?? 0) + 1,
    timestamp: nowIso(),
    summary: input.summary,
    parentVersion: input.parentVersion,
    mermaidChecksum: input.mermaidChecksum,
    cases: input.cases,
  };
  const versions = [...doc.versions, next];
  const trimmed =
    versions.length > TC_HISTORY_MAX
      ? versions.slice(versions.length - TC_HISTORY_MAX)
      : versions;
  return { ...doc, versions: trimmed };
}

export function createDocument(input: {
  documentId: string;
  figmaFileKey: string;
  figmaStartNodeId: string;
  mermaidId: string;
  dumpId: string;
  mermaidChecksum: string;
  cases: TestCase[];
}): TcDocument {
  const empty: TcDocument = {
    documentId: input.documentId,
    figmaFileKey: input.figmaFileKey,
    figmaStartNodeId: input.figmaStartNodeId,
    mermaidId: input.mermaidId,
    dumpId: input.dumpId,
    versions: [],
  };
  return appendVersion(empty, {
    summary: TC_CHANGE.create,
    parentVersion: null,
    mermaidChecksum: input.mermaidChecksum,
    cases: input.cases,
  });
}

export function addGeneratedVersion(
  doc: TcDocument,
  cases: TestCase[],
  mermaidChecksum: string,
  mermaidId: string,
  dumpId: string,
): TcDocument {
  const last = headVersion(doc);
  return appendVersion(
    { ...doc, mermaidId, dumpId },
    {
      summary: TC_CHANGE.create,
      parentVersion: last?.version ?? null,
      mermaidChecksum,
      cases,
    },
  );
}

export function addEditVersion(
  doc: TcDocument,
  cases: TestCase[],
): TcDocument {
  const last = headVersion(doc);
  if (!last) throw new TcError(TC_ERROR.versionNotFound, "0");
  return appendVersion(doc, {
    summary: TC_CHANGE.edit,
    parentVersion: last.version,
    mermaidChecksum: last.mermaidChecksum,
    cases,
  });
}

export function addRestoreVersion(doc: TcDocument, version: number): TcDocument {
  const target = getVersion(doc, version);
  const last = headVersion(doc);
  return appendVersion(doc, {
    summary: TC_CHANGE.restore,
    parentVersion: last?.version ?? null,
    mermaidChecksum: target.mermaidChecksum,
    cases: target.cases,
  });
}

export function removeVersion(doc: TcDocument, version: number): TcDocument {
  getVersion(doc, version);
  return {
    ...doc,
    versions: doc.versions.filter((item) => item.version !== version),
  };
}
