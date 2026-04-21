import { createStep, type Step } from "../../types";
import type { GeneratedDocTestCase } from "./types";

function buildCommentStep(label: string): Step {
  return {
    ...createStep("wait_ms"),
    waitMs: 0,
    label,
  };
}

function buildAssertStep(expectedText: string): Step {
  return {
    ...createStep("assert_text"),
    selectorStrategy: "text",
    selectorValue: expectedText,
    label: `기대 결과: ${expectedText}`,
  };
}

export interface ToScenarioStepsOptions {
  includeHeader?: boolean;
}

export function convertTestCasesToSteps(
  testCases: GeneratedDocTestCase[],
  options: ToScenarioStepsOptions = {},
): Step[] {
  const steps: Step[] = [];
  testCases.forEach((tc, idx) => {
    if (options.includeHeader !== false) {
      steps.push(
        buildCommentStep(`[TC ${idx + 1}] ${tc.title} (${tc.priority}/${tc.type})`),
      );
    }
    if (tc.preconditions.length > 0) {
      steps.push(
        buildCommentStep(`사전 조건: ${tc.preconditions.join(" / ")}`),
      );
    }
    for (const line of tc.steps) {
      steps.push(buildCommentStep(line));
    }
    for (const expected of tc.expectedResults) {
      steps.push(buildAssertStep(expected));
    }
  });
  return steps;
}
