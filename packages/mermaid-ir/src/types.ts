export interface MermaidNodeMapEntry {
  mermaidId: string;
  figmaNodeId: string;
}

export interface MermaidIr {
  mermaid: string;
  checksum: string;
  nodeMap: MermaidNodeMapEntry[];
}

export interface StoredMermaidIr extends MermaidIr {
  id: string;
  dumpId: string;
  createdAt: string;
}

export interface MermaidIrSummary {
  id: string;
  dumpId: string;
  checksum: string;
  nodeCount: number;
  createdAt: string;
}
