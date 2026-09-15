import { INGEST_ERROR, IngestError } from "./error-codes.js";
import type { ParsedFigmaUrl } from "./types.js";

function nodeIdFromQuery(raw: string | null): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  if (!decoded) return null;
  return decoded.includes(":") ? decoded : decoded.replace(/-/g, ":");
}

export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new IngestError(INGEST_ERROR.invalidUrl);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new IngestError(INGEST_ERROR.invalidUrl);
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "figma.com") throw new IngestError(INGEST_ERROR.invalidUrl);

  const parts = url.pathname.split("/").filter(Boolean);
  const kindIndex = parts.findIndex((part) =>
    ["design", "file", "board", "proto", "slides"].includes(part),
  );
  const fileKey = kindIndex >= 0 ? parts[kindIndex + 1] : undefined;
  if (!fileKey) throw new IngestError(INGEST_ERROR.invalidUrl);

  const startNodeId = nodeIdFromQuery(url.searchParams.get("node-id"));
  if (!startNodeId) throw new IngestError(INGEST_ERROR.invalidUrl);

  return { fileKey, startNodeId };
}
