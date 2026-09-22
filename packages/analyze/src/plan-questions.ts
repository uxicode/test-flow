import { readFeatureRows, type ScreenSegment } from "@testflow/figma";
import type { PlannedQuestion } from "./types.js";

const LONG_BODY = 600;

export function planQuestions(screens: ScreenSegment[]): PlannedQuestion[] {
  const questions: PlannedQuestion[] = [];
  for (const screen of screens) {
    const rows = readFeatureRows(screen.body);
    const split = rows.length >= 2 && (screen.body.length > LONG_BODY || rows.length >= 3);
    if (!split) {
      questions.push({
        id: `q-${questions.length + 1}`,
        screenKey: screen.screenKey,
        screenName: screen.screenName,
        text: `${screen.screenName}\n${screen.body}`.trim(),
      });
      continue;
    }
    for (const row of rows) {
      questions.push({
        id: `q-${questions.length + 1}`,
        screenKey: screen.screenKey,
        screenName: screen.screenName,
        text: `${screen.screenName}\n[${row.title}] ${row.body}`.trim(),
      });
    }
  }
  return questions;
}
