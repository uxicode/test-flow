export const INGEST_ERROR = {
  invalidJson: "invalid_json",
  invalidSchema: "invalid_schema",
  nodeNotFound: "node_not_found",
  emptyGraph: "empty_graph",
  danglingEdge: "dangling_edge",
  mcpUnavailable: "mcp_unavailable",
  invalidUrl: "invalid_url",
  missingToken: "missing_token",
  figmaUnauthorized: "figma_unauthorized",
  figmaForbidden: "figma_forbidden",
  figmaRequestFailed: "figma_request_failed",
} as const;

export type IngestErrorCode =
  (typeof INGEST_ERROR)[keyof typeof INGEST_ERROR];

export const INGEST_ERROR_MESSAGE: Record<IngestErrorCode, string> = {
  [INGEST_ERROR.invalidJson]: "JSON을 파싱할 수 없습니다.",
  [INGEST_ERROR.invalidSchema]: "덤프 스키마가 올바르지 않습니다. fileKey, startNodeId, nodes, connections가 필요합니다.",
  [INGEST_ERROR.nodeNotFound]: "startNodeId에 해당하는 노드가 없습니다.",
  [INGEST_ERROR.emptyGraph]: "노드가 비어 있습니다.",
  [INGEST_ERROR.danglingEdge]: "연결이 존재하지 않는 노드를 가리킵니다.",
  [INGEST_ERROR.mcpUnavailable]: "Figma MCP는 앱 수집 경로가 아닙니다. URL과 토큰으로 가져오세요.",
  [INGEST_ERROR.invalidUrl]: "Figma URL에서 fileKey 또는 node-id를 읽지 못했습니다.",
  [INGEST_ERROR.missingToken]: "Figma 토큰이 없습니다. 환경변수 FIGMA_ACCESS_TOKEN 또는 앱 설정에 저장하세요.",
  [INGEST_ERROR.figmaUnauthorized]: "Figma 토큰이 거부되었습니다. 토큰을 다시 저장하세요.",
  [INGEST_ERROR.figmaForbidden]: "이 Figma 파일에 접근할 권한이 없습니다.",
  [INGEST_ERROR.figmaRequestFailed]: "Figma API 요청에 실패했습니다.",
};

export class IngestError extends Error {
  readonly code: IngestErrorCode;

  constructor(code: IngestErrorCode, detail?: string) {
    super(detail ? `${INGEST_ERROR_MESSAGE[code]} ${detail}` : INGEST_ERROR_MESSAGE[code]);
    this.name = "IngestError";
    this.code = code;
  }
}
