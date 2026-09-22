const QUOTED = /[「『"“']([^」』"”'\n]{2,})[」』"”']/gu;

export function phrasesToFind(expectedText: string): string[] {
  const phrases: string[] = [];
  for (const match of expectedText.matchAll(QUOTED)) {
    const phrase = match[1]?.trim().replace(/[.。]\s*$/u, "") ?? "";
    if (phrase.length >= 2) phrases.push(phrase);
  }
  if (phrases.length > 0) return [...new Set(phrases)];
  const trimmed = expectedText.trim();
  return trimmed ? [trimmed] : [];
}

function compact(value: string): string {
  return value.replace(/[\s."“”'「」()（）]/gu, "");
}

function distance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let row = 0; row < rows; row += 1) {
    const line = table[row];
    if (line) line[0] = row;
  }
  const first = table[0];
  if (first) {
    for (let col = 0; col < cols; col += 1) first[col] = col;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      const current = table[row];
      const previous = table[row - 1];
      if (!current || !previous) continue;
      current[col] = Math.min(
        (previous[col] ?? 0) + 1,
        (current[col - 1] ?? 0) + 1,
        (previous[col - 1] ?? 0) + cost,
      );
    }
  }
  return table[left.length]?.[right.length] ?? Math.max(left.length, right.length);
}

function samePhrase(pageLine: string, phrase: string): boolean {
  const hay = compact(pageLine);
  const needle = compact(phrase);
  if (needle.length < 2 || hay.length < 2) return false;
  if (hay.includes(needle)) return true;
  const longer = Math.max(hay.length, needle.length);
  const shorter = Math.min(hay.length, needle.length);
  if (longer > shorter * 1.35) return false;
  return 1 - distance(hay, needle) / longer >= 0.8;
}

const LOGIN_LINE = /이메일|비밀번호|로그인|password|email/iu;

export function openedScreenTitle(pageText: string): string | null {
  const lines = pageText
    .split(/\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2 && line.length <= 20 && !LOGIN_LINE.test(line));
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  const repeated = [...counts.entries()].find((entry) => entry[1] >= 2);
  return repeated?.[0] ?? lines[0] ?? null;
}

export function findShownPhrase(pageText: string, phrases: string[]): string | null {
  const lines = pageText
    .split(/\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
  for (const phrase of phrases) {
    const shown = lines.find((line) => samePhrase(line, phrase));
    if (shown) return shown;
  }
  return null;
}
