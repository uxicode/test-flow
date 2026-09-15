export const TC_CHANGE = {
  create: "create",
  edit: "edit",
  restore: "restore",
} as const;

export type TcChangeSummary = (typeof TC_CHANGE)[keyof typeof TC_CHANGE];

export interface TestStep {
  action: string;
  targetHint: string;
  expected: string;
  sourceNodeId: string;
  mermaidNodeId?: string;
}

export interface TestCase {
  id: string;
  title: string;
  preconditions: string;
  steps: TestStep[];
}

export interface TcVersion {
  version: number;
  timestamp: string;
  summary: TcChangeSummary;
  parentVersion: number | null;
  mermaidChecksum: string;
  cases: TestCase[];
}

export interface TcDocument {
  documentId: string;
  figmaFileKey: string;
  figmaStartNodeId: string;
  mermaidId: string;
  dumpId: string;
  versions: TcVersion[];
}

export interface TcDocumentSummary {
  documentId: string;
  figmaFileKey: string;
  figmaStartNodeId: string;
  mermaidChecksum: string;
  headVersion: number;
  caseCount: number;
  updatedAt: string;
}

export interface TcVersionSummary {
  version: number;
  timestamp: string;
  summary: TcChangeSummary;
  parentVersion: number | null;
  mermaidChecksum: string;
  caseCount: number;
}
