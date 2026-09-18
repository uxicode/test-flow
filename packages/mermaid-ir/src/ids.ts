export function toMermaidId(figmaNodeId: string): string {
  const cleaned = figmaNodeId.replace(/[^A-Za-z0-9]/g, "_");
  const body = cleaned.length > 0 ? cleaned : "node";
  if (/^[A-Za-z]/.test(body)) return body;
  return `n${body}`;
}

export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "#quot;")
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function unescapeMermaidLabel(text: string): string {
  return text.replace(/#quot;/g, '"').replace(/\\\\/g, "\\");
}
