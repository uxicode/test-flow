import { headVersion } from "./history.js";
import type { TcDocument, TcDocumentSummary, TcVersionSummary } from "./types.js";

export function toDocumentSummary(doc: TcDocument): TcDocumentSummary {
  const head = headVersion(doc);
  return {
    documentId: doc.documentId,
    figmaFileKey: doc.figmaFileKey,
    figmaStartNodeId: doc.figmaStartNodeId,
    mermaidChecksum: head?.mermaidChecksum ?? "",
    headVersion: head?.version ?? 0,
    caseCount: head?.cases.length ?? 0,
    updatedAt: head?.timestamp ?? "",
  };
}

export function toVersionSummaries(doc: TcDocument): TcVersionSummary[] {
  return [...doc.versions]
    .reverse()
    .map((version) => ({
      version: version.version,
      timestamp: version.timestamp,
      summary: version.summary,
      parentVersion: version.parentVersion,
      mermaidChecksum: version.mermaidChecksum,
      caseCount: version.cases.length,
    }));
}
