import { MERMAID_ERROR, MermaidError } from "./error-codes.js";

const HEADER = /^flowchart\s+(TD|TB|LR|RL)\s*$/;
const NODE = /^([A-Za-z][A-Za-z0-9_]*)\["(.*)"\]$/;
const EDGE = /^([A-Za-z][A-Za-z0-9_]*)\s*-->(?:\|(.*)\|)?\s*([A-Za-z][A-Za-z0-9_]*)$/;

export function validateMermaid(source: string): void {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || !HEADER.test(lines[0] ?? ""))
    throw new MermaidError(MERMAID_ERROR.invalidMermaid, "flowchart 헤더가 필요합니다.");

  const declared = new Set<string>();
  for (const line of lines.slice(1)) {
    const node = NODE.exec(line);
    if (node) {
      declared.add(node[1] ?? "");
      continue;
    }
    const edge = EDGE.exec(line);
    if (edge) {
      const from = edge[1] ?? "";
      const to = edge[3] ?? "";
      if (!declared.has(from) || !declared.has(to))
        throw new MermaidError(
          MERMAID_ERROR.invalidMermaid,
          `선언되지 않은 노드: ${from} → ${to}`,
        );
      continue;
    }
    throw new MermaidError(MERMAID_ERROR.invalidMermaid, line);
  }
}
