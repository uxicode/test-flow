export const HINT_KIND = {
  url: "url",
  css: "css",
  text: "text",
} as const;

export type HintKind = (typeof HINT_KIND)[keyof typeof HINT_KIND];

export function classifyHint(hint: string): HintKind {
  const trimmed = hint.trim();
  if (/^https?:\/\//i.test(trimmed)) return HINT_KIND.url;
  if (/^[#.[]/.test(trimmed) || trimmed.startsWith("data-") || trimmed.includes(">>"))
    return HINT_KIND.css;
  return HINT_KIND.text;
}
