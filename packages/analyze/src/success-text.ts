import { readFeatureRows } from "@testflow/figma";
import type { PlannedQuestion, ScreenAnalysis, ScreenFeature } from "./types.js";

export function successTextFromSpec(text: string): string {
  const rows = readFeatureRows(text);
  const lines = rows.length > 0 ? rows.map((row) => row.body) : text.split("\n");
  for (const raw of lines) {
    const body = raw.trim();
    if (!body || !/성공|이동/u.test(body)) continue;
    if (/올바르지 않|오류|에러|실패/u.test(body) && !/성공/u.test(body)) continue;
    const afterSuccess = body.match(/(?:성공|완료)\s*(?:시|때)\s+(.+?)(?:으로|로)\s*이동/u);
    if (afterSuccess?.[1]) return afterSuccess[1].trim();
    const moved = body.match(/(.+?)(?:으로|로)\s*이동/u);
    if (moved?.[1]) return moved[1].trim();
    return body;
  }
  return "";
}

export function attachFeatures(
  screens: ScreenAnalysis[],
  questions: PlannedQuestion[],
): ScreenAnalysis[] {
  return screens.map((screen) => {
    const features: ScreenFeature[] = questions
      .filter((question) => question.screenKey === screen.screenKey)
      .flatMap((question) => readFeatureRows(question.text));
    if (features.length === 0) return screen;
    return { ...screen, features };
  });
}

export function fillMissingSuccess(
  screens: ScreenAnalysis[],
  questions: PlannedQuestion[],
): ScreenAnalysis[] {
  return screens.map((screen) => {
    if (screen.successText) return screen;
    const text = questions
      .filter((question) => question.screenKey === screen.screenKey)
      .map((question) => question.text)
      .join("\n");
    const successText = successTextFromSpec(text);
    if (!successText) return screen;
    return { ...screen, successText };
  });
}
