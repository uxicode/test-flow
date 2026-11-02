const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[\da-f]+|[a-z]+);/giu, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** 주석 HTML 조각을 줄 단위 텍스트로 바꾼다. 블록 요소 경계에서 줄을 나눈다. */
export function htmlToLines(html: string): string[] {
  const withBreaks = html.replace(/<\/(?:p|li|ul|ol|div|h[1-6]|tr)>|<br\s*\/?>/giu, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/gu, ""));
  return text
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}
