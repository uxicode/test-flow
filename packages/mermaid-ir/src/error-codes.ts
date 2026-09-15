export const MERMAID_ERROR = {
  emptyDump: "empty_dump",
  invalidMermaid: "invalid_mermaid",
  unknownNode: "unknown_node",
} as const;

export type MermaidErrorCode =
  (typeof MERMAID_ERROR)[keyof typeof MERMAID_ERROR];

export const MERMAID_ERROR_MESSAGE: Record<MermaidErrorCode, string> = {
  [MERMAID_ERROR.emptyDump]: "덤프에 변환할 노드가 없습니다.",
  [MERMAID_ERROR.invalidMermaid]: "생성된 Mermaid 문법이 올바르지 않습니다.",
  [MERMAID_ERROR.unknownNode]: "연결이 덤프에 없는 노드를 가리킵니다.",
};

export class MermaidError extends Error {
  readonly code: MermaidErrorCode;
  readonly figmaNodeId?: string;

  constructor(code: MermaidErrorCode, detail?: string, figmaNodeId?: string) {
    super(detail ? `${MERMAID_ERROR_MESSAGE[code]} ${detail}` : MERMAID_ERROR_MESSAGE[code]);
    this.name = "MermaidError";
    this.code = code;
    this.figmaNodeId = figmaNodeId;
  }
}
