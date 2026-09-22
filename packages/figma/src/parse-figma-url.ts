export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string;
}

const FILE_KEY = /figma\.com\/(?:design|file|proto)\/([A-Za-z0-9]+)/u;

export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Figma URL에서 fileKey 또는 node-id를 읽지 못했습니다.");
  }
  const fileKey = FILE_KEY.exec(parsed.href)?.[1];
  const rawNode = parsed.searchParams.get("node-id");
  if (!fileKey || !rawNode)
    throw new Error("Figma URL에서 fileKey 또는 node-id를 읽지 못했습니다.");
  return { fileKey, nodeId: rawNode.replace(/-/g, ":") };
}
