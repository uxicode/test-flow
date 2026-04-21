const PRINTABLE_REGEX = /[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/u;
const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const LATIN_REGEX = /[A-Za-z]/;

export interface TextQuality {
  score: number;
  hangulRatio: number;
  latinRatio: number;
  printableRatio: number;
  controlRatio: number;
  length: number;
  looksValid: boolean;
}

export function scoreTextQuality(text: string): TextQuality {
  const length = text.length;
  if (length === 0) {
    return {
      score: 0,
      hangulRatio: 0,
      latinRatio: 0,
      printableRatio: 0,
      controlRatio: 0,
      length: 0,
      looksValid: false,
    };
  }
  let printable = 0;
  let control = 0;
  let hangul = 0;
  let latin = 0;
  for (const ch of text) {
    if (HANGUL_REGEX.test(ch)) hangul++;
    else if (LATIN_REGEX.test(ch)) latin++;
    if (PRINTABLE_REGEX.test(ch)) printable++;
    const code = ch.charCodeAt(0);
    if ((code < 0x20 && ch !== "\n" && ch !== "\r" && ch !== "\t") || code === 0x7f) {
      control++;
    }
  }
  const printableRatio = printable / length;
  const controlRatio = control / length;
  const hangulRatio = hangul / length;
  const latinRatio = latin / length;
  const meaningfulRatio = Math.max(hangulRatio + latinRatio, printableRatio * 0.7);
  const score = Math.max(0, meaningfulRatio - controlRatio * 3);
  const looksValid = score >= 0.3 && length >= 40;
  return {
    score,
    hangulRatio,
    latinRatio,
    printableRatio,
    controlRatio,
    length,
    looksValid,
  };
}

export function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
