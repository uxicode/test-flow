import type { FigmaApiNode } from "./figma-api-types.js";
import type { FigmaDump } from "./types.js";

function walk(node: FigmaApiNode, visit: (current: FigmaApiNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function rootsHaveTextCharacters(roots: FigmaApiNode[]): boolean {
  for (const root of roots) {
    let found = false;
    walk(root, (node) => {
      if (node.characters?.trim()) found = true;
    });
    if (found) return true;
  }
  return false;
}

export function needsVisionAnalysis(
  dump: FigmaDump,
  roots: FigmaApiNode[],
): boolean {
  if (dump.connections.length > 0) return false;
  if (dump.nodes.some((node) => Boolean(node.text?.trim()))) return false;
  if (rootsHaveTextCharacters(roots)) return false;
  return true;
}
