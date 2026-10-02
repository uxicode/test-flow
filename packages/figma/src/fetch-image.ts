import { parseFigmaUrl } from "./parse-figma-url.js";
import type { FetchLike } from "./fetch-spec.js";

function bytesToBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

export function pngSize(bytes: ArrayBuffer): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function visionScale(width: number, height: number, maxSide: number): number {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return 1;
  return Math.min(4, Math.max(0.01, Number((maxSide / longest).toFixed(3))));
}

async function downloadPng(
  fetchImpl: FetchLike,
  fileKey: string,
  nodeId: string,
  token: string,
  scale: number,
): Promise<ArrayBuffer | null> {
  const endpoint = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`;
  const listed = await fetchImpl(endpoint, {
    headers: { "X-Figma-Token": token },
  });
  if (listed.status >= 400) return null;
  const payload = (await listed.json()) as { images?: Record<string, string | null> };
  const imageUrl = payload.images?.[nodeId];
  if (!imageUrl) return null;
  const file = await fetchImpl(imageUrl);
  if (file.status >= 400 || !file.arrayBuffer) return null;
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return null;
  return bytes;
}

export async function fetchSpecImage(options: {
  url: string;
  token: string;
  fetchImpl?: FetchLike;
  maxSide?: number;
}): Promise<string | null> {
  if (!options.token.trim()) return null;
  const parsed = parseFigmaUrl(options.url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const first = await downloadPng(fetchImpl, parsed.fileKey, parsed.nodeId, options.token, 1);
  if (!first) return null;
  const maxSide = options.maxSide;
  if (!maxSide) return bytesToBase64(first);
  const size = pngSize(first);
  if (!size) return bytesToBase64(first);
  const scale = visionScale(size.width, size.height, maxSide);
  if (scale === 1) return bytesToBase64(first);
  const resized = await downloadPng(fetchImpl, parsed.fileKey, parsed.nodeId, options.token, scale);
  if (!resized) return bytesToBase64(first);
  return bytesToBase64(resized);
}
