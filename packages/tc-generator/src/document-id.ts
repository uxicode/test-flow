export function tcDocumentId(fileKey: string, startNodeId: string): string {
  const raw = `${fileKey}__${startNodeId}`;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, "_");
  return cleaned.length > 0 ? cleaned : "tc-doc";
}
