import { TC_ERROR, TcError } from "./error-codes.js";
import type { TestCase } from "./types.js";

export function validateCases(cases: TestCase[]): void {
  for (const testCase of cases) {
    for (const step of testCase.steps) {
      if (!step.targetHint.trim())
        throw new TcError(TC_ERROR.missingTargetHint, testCase.id);
    }
  }
}
