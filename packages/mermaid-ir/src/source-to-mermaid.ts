import type { FigmaDump } from "@testflow/figma-ingest";
import { mermaidChecksum } from "./checksum.js";
import { MERMAID_ERROR, MermaidError } from "./error-codes.js";
import { unescapeMermaidLabel } from "./ids.js";
import type { MermaidIr, MermaidNodeMapEntry } from "./types.js";
import { parseMermaidGraph } from "./validate-mermaid.js";

function normalizeMermaidSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
}

function mermaidLabelToName(label: string): string {
  return unescapeMermaidLabel(label)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[━─]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mermaidFromSource(source: string): MermaidIr {
  const mermaid = normalizeMermaidSource(source);
  const parsed = parseMermaidGraph(mermaid);
  if (parsed.nodes.length === 0)
    throw new MermaidError(MERMAID_ERROR.invalidMermaid, "노드가 필요합니다.");
  const nodeMap: MermaidNodeMapEntry[] = parsed.nodes.map((node) => ({
    mermaidId: node.id,
    figmaNodeId: node.id,
  }));
  return {
    mermaid,
    checksum: mermaidChecksum(mermaid),
    nodeMap,
  };
}

export function mermaidToDump(ir: MermaidIr): FigmaDump {
  const parsed = parseMermaidGraph(ir.mermaid);
  const start = parsed.nodes[0];
  if (!start) throw new MermaidError(MERMAID_ERROR.invalidMermaid, "노드가 필요합니다.");
  return {
    fileKey: `manual-${ir.checksum.slice(0, 12)}`,
    startNodeId: start.id,
    nodes: parsed.nodes.map((node) => ({
      id: node.id,
      name: mermaidLabelToName(node.label) || node.id,
    })),
    connections: parsed.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: mermaidLabelToName(edge.label) } : {}),
    })),
  };
}
