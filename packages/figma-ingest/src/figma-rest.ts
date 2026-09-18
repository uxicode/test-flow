import { INGEST_ERROR, IngestError } from "./error-codes.js";
import type { FigmaApiNode } from "./figma-api-types.js";
import { collectMissingNodeIds } from "./extract-flow-graph.js";

export interface FigmaNodesResponse {
  status?: number;
  err?: string;
  nodes?: Record<string, { document?: FigmaApiNode } | null>;
}

export interface FetchInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface FetchResponseLike {
  status: number;
  json: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export type FetchLike = (
  url: string,
  init?: FetchInitLike,
) => Promise<FetchResponseLike>;

function authHeaders(token: string): Record<string, string> {
  return { "X-Figma-Token": token };
}

function throwForStatus(status: number): void {
  if (status === 401) throw new IngestError(INGEST_ERROR.figmaUnauthorized);
  if (status === 403) throw new IngestError(INGEST_ERROR.figmaForbidden);
  if (status === 404) throw new IngestError(INGEST_ERROR.nodeNotFound);
  if (status >= 400)
    throw new IngestError(INGEST_ERROR.figmaRequestFailed, `HTTP ${status}`);
}

export async function fetchFigmaDocuments(options: {
  fileKey: string;
  nodeIds: string[];
  token: string;
  fetchImpl?: FetchLike;
}): Promise<FigmaApiNode[]> {
  const unique = [...new Set(options.nodeIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const fetchImpl = options.fetchImpl ?? fetch;
  const ids = unique.map((id) => encodeURIComponent(id)).join(",");
  const url = `https://api.figma.com/v1/files/${encodeURIComponent(options.fileKey)}/nodes?ids=${ids}`;
  const response = await fetchImpl(url, { headers: authHeaders(options.token) });
  throwForStatus(response.status);

  const body = (await response.json()) as FigmaNodesResponse;
  if (body.err) throw new IngestError(INGEST_ERROR.figmaRequestFailed);

  const documents: FigmaApiNode[] = [];
  for (const id of unique) {
    const entry = body.nodes?.[id] ?? body.nodes?.[id.replace(/-/g, ":")];
    if (!entry?.document)
      throw new IngestError(INGEST_ERROR.nodeNotFound, id);
    documents.push(entry.document);
  }
  return documents;
}

export async function fetchFlowRoots(options: {
  fileKey: string;
  startNodeId: string;
  token: string;
  fetchImpl?: FetchLike;
}): Promise<FigmaApiNode[]> {
  const known = new Map<string, FigmaApiNode>();
  const startDocs = await fetchFigmaDocuments({
    fileKey: options.fileKey,
    nodeIds: [options.startNodeId],
    token: options.token,
    fetchImpl: options.fetchImpl,
  });
  for (const doc of startDocs) known.set(doc.id, doc);

  let missing = collectMissingNodeIds([...known.values()], new Set(known.keys()));
  let guard = 0;
  while (missing.length > 0 && guard < 5) {
    guard += 1;
    const extra = await fetchFigmaDocuments({
      fileKey: options.fileKey,
      nodeIds: missing,
      token: options.token,
      fetchImpl: options.fetchImpl,
    });
    for (const doc of extra) known.set(doc.id, doc);
    missing = collectMissingNodeIds([...known.values()], new Set(known.keys()));
  }

  return [...known.values()];
}

export interface FigmaImagesResponse {
  err?: string | null;
  images?: Record<string, string | null>;
}

export async function fetchFigmaNodeImage(options: {
  fileKey: string;
  nodeId: string;
  token: string;
  fetchImpl?: FetchLike;
  scale?: number;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const scale = options.scale ?? 2;
  const ids = encodeURIComponent(options.nodeId);
  const url = `https://api.figma.com/v1/images/${encodeURIComponent(options.fileKey)}?ids=${ids}&format=png&scale=${scale}`;
  const response = await fetchImpl(url, { headers: authHeaders(options.token) });
  throwForStatus(response.status);

  const body = (await response.json()) as FigmaImagesResponse;
  if (body.err) throw new IngestError(INGEST_ERROR.imageExportFailed, body.err);

  const imageUrl =
    body.images?.[options.nodeId] ??
    body.images?.[options.nodeId.replace(/-/g, ":")];
  if (!imageUrl)
    throw new IngestError(INGEST_ERROR.imageExportFailed, options.nodeId);

  const imageResponse = await fetchImpl(imageUrl);
  if (imageResponse.status >= 400)
    throw new IngestError(
      INGEST_ERROR.imageExportFailed,
      `HTTP ${imageResponse.status}`,
    );
  if (!imageResponse.arrayBuffer)
    throw new IngestError(INGEST_ERROR.imageExportFailed, "arrayBuffer 없음");

  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.byteLength === 0)
    throw new IngestError(INGEST_ERROR.imageExportFailed, "빈 이미지");
  return bytes.toString("base64");
}
