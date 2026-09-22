export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  visible?: boolean;
  children?: FigmaNode[];
}

export function collectTextLines(roots: FigmaNode[]): string[] {
  const lines: string[] = [];

  function walk(node: FigmaNode): void {
    if (node.visible === false) return;
    const characters = node.characters?.trim();
    if (characters) {
      for (const line of characters.split(/\r?\n|\u2028|\u2029/u)) {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
      }
    }
    for (const child of node.children ?? []) walk(child);
  }

  for (const root of roots) walk(root);
  return lines;
}
