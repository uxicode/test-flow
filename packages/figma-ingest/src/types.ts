export const INGEST_SOURCE = {
  jsonFile: "json-file",
  figmaRest: "figma-rest",
  mcp: "mcp",
} as const;

export type IngestSource = (typeof INGEST_SOURCE)[keyof typeof INGEST_SOURCE];

export interface FigmaFlowNode {
  id: string;
  name: string;
  type?: string;
  text?: string;
}

export interface FigmaFlowConnection {
  from: string;
  to: string;
  label?: string;
}

export interface FigmaDump {
  fileKey: string;
  startNodeId: string;
  nodes: FigmaFlowNode[];
  connections: FigmaFlowConnection[];
}

export interface StoredFigmaDump extends FigmaDump {
  id: string;
  importedAt: string;
  source: IngestSource;
}

export interface FigmaDumpSummary {
  id: string;
  fileKey: string;
  startNodeId: string;
  nodeCount: number;
  connectionCount: number;
  importedAt: string;
  source: IngestSource;
}

export interface ParsedFigmaUrl {
  fileKey: string;
  startNodeId: string;
}
