import type { ScreenAnalysis } from "./types.js";

export function normalizePhrase(text: string): string {
  return text.replace(/[\s"'“”‘’.,!?·~\-()[\]]/gu, "").toLowerCase();
}

export function specHasPhrase(spec: string, phrase: string): boolean {
  const needle = normalizePhrase(phrase);
  if (needle.length < 4) return false;
  return normalizePhrase(spec).includes(needle);
}

export function keepSpecWarnings(analysis: ScreenAnalysis, spec: string): ScreenAnalysis {
  return {
    ...analysis,
    inputs: analysis.inputs.map((input) => {
      if (!input.warning || specHasPhrase(spec, input.warning)) return input;
      return { ...input, warning: "", failureExample: "" };
    }),
  };
}
