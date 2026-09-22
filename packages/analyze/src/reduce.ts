import type { InputFinding, ScreenAnalysis } from "./types.js";

function findingKey(input: InputFinding): string {
  return `${input.target}|${input.warning}|${input.constraint}`;
}

export function reduceAnalyses(parts: ScreenAnalysis[]): ScreenAnalysis[] {
  const byKey = new Map<string, ScreenAnalysis>();
  for (const part of parts) {
    const current = byKey.get(part.screenKey);
    if (!current) {
      byKey.set(part.screenKey, {
        ...part,
        inputs: [...part.inputs],
      });
      continue;
    }
    if (!current.successText && part.successText) current.successText = part.successText;
    if (!current.buttonName && part.buttonName) current.buttonName = part.buttonName;
    const seen = new Set(current.inputs.map(findingKey));
    for (const input of part.inputs) {
      const key = findingKey(input);
      if (seen.has(key)) continue;
      seen.add(key);
      current.inputs.push(input);
    }
  }
  return [...byKey.values()];
}
