import { MERMAID_ERROR, MermaidError } from "./error-codes.js";

const HEADER = /^(?:flowchart|graph)\s+(?:TD|TB|LR|RL)\s*$/i;
const SKIP =
  /^(?:%%|classDef\b|class\s|style\s|linkStyle\s|subgraph\b|end$|direction\b)/i;

export interface ParsedMermaidNode {
  id: string;
  label: string;
}

export interface ParsedMermaidEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ParsedMermaidGraph {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
}

function skipWs(source: string, index: number): number {
  while (index < source.length) {
    const ch = source[index];
    if (ch !== " " && ch !== "\t") break;
    index += 1;
  }
  return index;
}

function takeBetween(
  source: string,
  index: number,
  open: string,
  close: string,
): { text: string; end: number } | null {
  if (!source.startsWith(open, index)) return null;
  const start = index + open.length;
  const closeAt = source.indexOf(close, start);
  if (closeAt < 0) return null;
  return { text: source.slice(start, closeAt), end: closeAt + close.length };
}

function matchShape(
  source: string,
  index: number,
): { label: string; end: number } | null {
  const found =
    takeBetween(source, index, '(["', '"])') ??
    takeBetween(source, index, '["', '"]') ??
    takeBetween(source, index, '{"', '"}') ??
    takeBetween(source, index, '("', '")') ??
    takeBetween(source, index, "([", "])") ??
    takeBetween(source, index, "((", "))") ??
    takeBetween(source, index, "{", "}") ??
    takeBetween(source, index, "(", ")") ??
    takeBetween(source, index, "[", "]");
  if (!found) return null;
  return { label: found.text, end: found.end };
}

function matchNode(
  source: string,
  index: number,
): { id: string; label?: string; end: number } | null {
  index = skipWs(source, index);
  const idMatch = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(index));
  if (!idMatch) return null;
  const id = idMatch[0];
  let end = index + id.length;
  const shape = matchShape(source, end);
  let label: string | undefined;
  if (shape) {
    label = shape.label;
    end = shape.end;
  }
  const classMatch = /^:::[\w,-]+/.exec(source.slice(end));
  if (classMatch) end += classMatch[0].length;
  return label === undefined ? { id, end } : { id, label, end };
}

function matchEdge(
  source: string,
  index: number,
): { label?: string; end: number } | null {
  index = skipWs(source, index);
  const rest = source.slice(index);
  const quoted = /^--\s+"((?:\\.|[^"\\])*)"\s*-->/.exec(rest);
  if (quoted) {
    return {
      label: (quoted[1] ?? "").replace(/\\"/g, '"'),
      end: index + quoted[0].length,
    };
  }
  const labeled = /^(?:-.->|-->|==>)\|([^|]*)\|/.exec(rest);
  if (labeled) {
    const consumed = labeled[0].length + (/^\s*/.exec(rest.slice(labeled[0].length))?.[0].length ?? 0);
    return { label: labeled[1], end: index + consumed };
  }
  const plain = /^(?:-.->|-->|==>|---)/.exec(rest);
  if (!plain) return null;
  const consumed = plain[0].length + (/^\s*/.exec(rest.slice(plain[0].length))?.[0].length ?? 0);
  return { end: index + consumed };
}

function rememberNode(
  node: { id: string; label?: string },
  seen: Map<string, ParsedMermaidNode>,
  nodes: ParsedMermaidNode[],
): void {
  const existing = seen.get(node.id);
  if (!existing) {
    const created = { id: node.id, label: node.label ?? node.id };
    seen.set(node.id, created);
    nodes.push(created);
    return;
  }
  if (node.label && existing.label === existing.id) existing.label = node.label;
}

function parseStatement(
  line: string,
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  seen: Map<string, ParsedMermaidNode>,
): void {
  let index = 0;
  let previousId: string | null = null;
  let pendingLabel: string | undefined;
  let parsedAny = false;

  while (index < line.length) {
    const node = matchNode(line, index);
    if (!node)
      throw new MermaidError(MERMAID_ERROR.invalidMermaid, line);
    parsedAny = true;
    rememberNode(node, seen, nodes);
    if (previousId) {
      const label = pendingLabel?.trim();
      edges.push(label ? { from: previousId, to: node.id, label } : { from: previousId, to: node.id });
    }
    previousId = node.id;
    pendingLabel = undefined;
    index = skipWs(line, node.end);
    if (index >= line.length) break;
    const edge = matchEdge(line, index);
    if (!edge) throw new MermaidError(MERMAID_ERROR.invalidMermaid, line);
    pendingLabel = edge.label;
    index = skipWs(line, edge.end);
    if (index >= line.length)
      throw new MermaidError(MERMAID_ERROR.invalidMermaid, line);
  }

  if (!parsedAny) throw new MermaidError(MERMAID_ERROR.invalidMermaid, line);
}

export function parseMermaidGraph(source: string): ParsedMermaidGraph {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || !HEADER.test(lines[0] ?? ""))
    throw new MermaidError(
      MERMAID_ERROR.invalidMermaid,
      "graph 또는 flowchart 헤더가 필요합니다.",
    );

  const nodes: ParsedMermaidNode[] = [];
  const edges: ParsedMermaidEdge[] = [];
  const seen = new Map<string, ParsedMermaidNode>();
  for (const line of lines.slice(1)) {
    if (SKIP.test(line)) continue;
    parseStatement(line, nodes, edges, seen);
  }
  return { nodes, edges };
}

export function validateMermaid(source: string): void {
  parseMermaidGraph(source);
}
