import type { FigmaDump } from "@testflow/figma-ingest";
import { mermaidChecksum } from "./checksum.js";
import { MERMAID_ERROR, MermaidError } from "./error-codes.js";
import { escapeMermaidLabel, toMermaidId } from "./ids.js";
import type { MermaidIr, MermaidNodeMapEntry } from "./types.js";
import { validateMermaid } from "./validate-mermaid.js";

function nodeLabel(name: string, text?: string): string {
  if (text && text !== name) return `${name}: ${text}`;
  return name;
}

export function dumpToMermaid(dump: FigmaDump): MermaidIr {
  if (dump.nodes.length === 0) throw new MermaidError(MERMAID_ERROR.emptyDump);

  const used = new Map<string, string>();
  const nodeMap: MermaidNodeMapEntry[] = [];

  function mermaidIdFor(figmaNodeId: string): string {
    const existing = used.get(figmaNodeId);
    if (existing) return existing;
    let candidate = toMermaidId(figmaNodeId);
    const taken = new Set(used.values());
    while (taken.has(candidate)) candidate = `${candidate}_x`;
    used.set(figmaNodeId, candidate);
    nodeMap.push({ mermaidId: candidate, figmaNodeId });
    return candidate;
  }

  const nodeByFigma = new Map(dump.nodes.map((node) => [node.id, node]));
  const lines = ["flowchart TD"];

  for (const node of dump.nodes) {
    const id = mermaidIdFor(node.id);
    const label = escapeMermaidLabel(nodeLabel(node.name, node.text));
    lines.push(`  ${id}["${label}"]`);
  }

  for (const edge of dump.connections) {
    if (!nodeByFigma.has(edge.from))
      throw new MermaidError(MERMAID_ERROR.unknownNode, edge.from, edge.from);
    if (!nodeByFigma.has(edge.to))
      throw new MermaidError(MERMAID_ERROR.unknownNode, edge.to, edge.to);
    const from = mermaidIdFor(edge.from);
    const to = mermaidIdFor(edge.to);
    const label = edge.label ? escapeMermaidLabel(edge.label) : "";
    lines.push(label ? `  ${from} -->|${label}| ${to}` : `  ${from} --> ${to}`);
  }

  const mermaid = `${lines.join("\n")}\n`;
  try {
    validateMermaid(mermaid);
  } catch (error) {
    if (error instanceof MermaidError)
      throw new MermaidError(error.code, error.message);
    throw error;
  }

  return {
    mermaid,
    checksum: mermaidChecksum(mermaid),
    nodeMap,
  };
}
