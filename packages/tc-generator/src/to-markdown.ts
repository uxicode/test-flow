import type { TestCase } from "./types.js";

export function testCasesToMarkdown(cases: TestCase[]): string {
  return cases
    .map((testCase) => {
      const steps = testCase.steps
        .map(
          (step, index) =>
            `${index + 1}. **${step.action}** \`${step.targetHint}\` — ${step.expected}`,
        )
        .join("\n");
      return `# ${testCase.id} ${testCase.title}\n\n## 사전조건\n\n${testCase.preconditions}\n\n## 스텝\n\n${steps}\n`;
    })
    .join("\n");
}
