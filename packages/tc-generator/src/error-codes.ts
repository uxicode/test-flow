export const TC_ERROR = {
  emptyMermaid: "empty_mermaid",
  emptyGraph: "empty_graph",
  startNotFound: "start_not_found",
  missingTargetHint: "missing_target_hint",
  versionNotFound: "version_not_found",
} as const;

export type TcErrorCode = (typeof TC_ERROR)[keyof typeof TC_ERROR];

export const TC_ERROR_MESSAGE: Record<TcErrorCode, string> = {
  [TC_ERROR.emptyMermaid]: "Mermaid가 비어 있어 TC를 만들 수 없습니다.",
  [TC_ERROR.emptyGraph]: "경로를 만들 수 있는 노드가 없습니다.",
  [TC_ERROR.startNotFound]: "시작 노드가 덤프에 없습니다.",
  [TC_ERROR.missingTargetHint]: "모든 스텝에 targetHint가 필요합니다.",
  [TC_ERROR.versionNotFound]: "해당 버전을 찾을 수 없습니다.",
};

export class TcError extends Error {
  readonly code: TcErrorCode;

  constructor(code: TcErrorCode, detail?: string) {
    super(detail ? `${TC_ERROR_MESSAGE[code]} ${detail}` : TC_ERROR_MESSAGE[code]);
    this.name = "TcError";
    this.code = code;
  }
}
