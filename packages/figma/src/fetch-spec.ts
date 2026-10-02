import { collectTextLines, type FigmaNode } from "./figma-node.js";
import { parseFigmaUrl } from "./parse-figma-url.js";

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    status: number;
    json: () => Promise<unknown>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  }>;
}

function asNode(value: unknown): FigmaNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  if (typeof record.type !== "string") return null;
  const children = Array.isArray(record.children)
    ? record.children.map(asNode).filter((node): node is FigmaNode => node !== null)
    : undefined;
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    characters: typeof record.characters === "string" ? record.characters : undefined,
    visible: typeof record.visible === "boolean" ? record.visible : undefined,
    children,
  };
}

export async function fetchSpecLines(options: {
  url: string;
  token: string;
  fetchImpl?: FetchLike;
}): Promise<string[]> {
  if (!options.token.trim()) throw new Error("Figma 토큰이 없습니다.");
  const parsed = parseFigmaUrl(options.url);
  const endpoint = `https://api.figma.com/v1/files/${parsed.fileKey}/nodes?ids=${encodeURIComponent(parsed.nodeId)}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    headers: { "X-Figma-Token": options.token },
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("Figma 토큰이 거부되었거나 파일 권한이 없습니다.");
  if (response.status === 404) throw new Error("Figma 노드를 찾지 못했습니다.");
  if (response.status >= 400) throw new Error(`Figma API 요청에 실패했습니다. HTTP ${response.status}`);
  const payload = (await response.json()) as {
    nodes?: Record<string, { document?: unknown } | null>;
  };
  const document = payload.nodes?.[parsed.nodeId]?.document;
  const root = asNode(document);
  if (!root) throw new Error("Figma 노드를 찾지 못했습니다.");
  return collectTextLines([root]);
}
