import type { ScreenAnalysis, ScreenFeature } from "@testflow/analyze";

export const TC_KIND = {
  success: "success",
  failure: "failure",
} as const;

export type TcKind = (typeof TC_KIND)[keyof typeof TC_KIND];

export interface TcInput {
  target: string;
  value: string;
}

export interface TestCase {
  id: string;
  screenName: string;
  kind: TcKind;
  title: string;
  inputs: TcInput[];
  buttonName: string;
  expectedText: string;
}

export function canonicalTarget(target: string): string {
  const stripped = target.replace(/\s*(입력|필드|란)\s*$/u, "").trim();
  if (/이메일|email/iu.test(stripped)) return "이메일";
  if (/비밀번호|패스워드|password/iu.test(stripped)) return "비밀번호";
  return stripped || target.trim();
}

function fieldOrder(target: string): number {
  if (target === "이메일") return 0;
  if (target === "비밀번호") return 1;
  return 2;
}

export function deriveFailureExample(target: string, constraint: string): string {
  const text = `${target} ${constraint}`;
  if (/이메일|email/iu.test(text)) return "not-an-email";
  if (/비밀번호|password/iu.test(text)) return "a";
  return "x";
}

export function buildTestCases(screens: ScreenAnalysis[]): TestCase[] {
  const cases: TestCase[] = [];
  for (const screen of screens) {
    const buttonName = screen.buttonName || "로그인";
    const ordered = [...screen.inputs]
      .map((input) => ({ ...input, target: canonicalTarget(input.target) }))
      .sort((left, right) => fieldOrder(left.target) - fieldOrder(right.target));
    if (screen.successText) {
      const seen = new Set<string>();
      const inputs: TcInput[] = [];
      for (const input of ordered) {
        if (seen.has(input.target)) continue;
        seen.add(input.target);
        inputs.push({ target: input.target, value: "" });
      }
      cases.push({
        id: `${screen.screenKey}-success`,
        screenName: screen.screenName,
        kind: TC_KIND.success,
        title: `${screen.screenName} 성공`,
        inputs,
        buttonName,
        expectedText: screen.successText,
      });
    }
    const seenFailures = new Set<string>();
    for (const input of ordered) {
      if (!input.warning) continue;
      const key = `${input.target}|${input.warning}`;
      if (seenFailures.has(key)) continue;
      seenFailures.add(key);
      cases.push({
        id: `${screen.screenKey}-failure-${cases.length + 1}`,
        screenName: screen.screenName,
        kind: TC_KIND.failure,
        title: `${screen.screenName} 실패 · ${input.target}`,
        inputs: [{
          target: input.target,
          value: input.failureExample || deriveFailureExample(input.target, input.constraint),
        }],
        buttonName,
        expectedText: input.warning,
      });
    }
    let checkIndex = 0;
    for (const feature of screen.features ?? []) {
      if (coveredByCase(feature, screen, Boolean(screen.successText))) continue;
      checkIndex += 1;
      cases.push({
        id: `${screen.screenKey}-check-${checkIndex}`,
        screenName: screen.screenName,
        kind: TC_KIND.success,
        title: `${screen.screenName} · ${feature.title}`,
        inputs: [],
        buttonName: "",
        expectedText: feature.title,
      });
    }
  }
  return cases;
}

function coveredByCase(feature: ScreenFeature, screen: ScreenAnalysis, hasSuccess: boolean): boolean {
  if (hasSuccess && /성공|이동/u.test(`${feature.title} ${feature.body}`)) return true;
  return screen.inputs.some((input) => input.warning && feature.body.includes(input.warning));
}
