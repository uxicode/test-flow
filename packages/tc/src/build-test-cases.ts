import type { InputFinding, ScreenAnalysis, ScreenFeature } from "@testflow/analyze";
import { CONTROL_KIND, type ControlKind } from "./control-kind.js";
import { parseControlKind } from "./control-kind.js";
import {
  defaultOptionValue,
  inferControlKind,
  parseOptionList,
} from "./infer-control.js";

function defaultDateRangeValue(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${format(start)},${format(now)}`;
}

export const TC_KIND = {
  success: "success",
  failure: "failure",
} as const;

export type TcKind = (typeof TC_KIND)[keyof typeof TC_KIND];

export interface TcInput {
  target: string;
  value: string;
  control?: ControlKind;
  options?: string[];
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

export function isEmptyFieldWarning(warning: string, constraint = ""): boolean {
  const text = `${warning} ${constraint}`;
  if (/형식|올바른|규칙|자리|최소|최대|이상|이하|패턴|숫자|영문/iu.test(text)) return false;
  return /입력해\s*(주세요|요)|입력하세|필수|비어|공백|누락|required|blank|empty/iu.test(text);
}

export function deriveFailureExample(target: string, constraint: string, warning = ""): string {
  if (isEmptyFieldWarning(warning, constraint)) return "";
  const text = `${target} ${constraint} ${warning}`;
  if (/이메일|email/iu.test(text)) return "not-an-email";
  if (/비밀번호|password/iu.test(text)) return "a";
  return "x";
}

export function failureInputValue(
  input: Pick<TcInput, "target" | "value">,
  warning: string,
  constraint = "",
): string {
  if (isEmptyFieldWarning(warning, constraint)) return "";
  const raw = input.value.trim();
  if (!raw || raw === input.target || raw === `${input.target} 입력`) {
    return deriveFailureExample(input.target, constraint, warning);
  }
  return raw;
}

const QUERY_SCREEN = /조회|검색|필터|현황|목록/u;

function isQueryLikeScreen(screen: ScreenAnalysis): boolean {
  return QUERY_SCREEN.test(`${screen.screenName} ${screen.buttonName}`);
}

/** 조회·현황 화면은 기능(기획 행)마다 TC를 나눈다. 로그인만 칸을 한 번에 묶는다. */
export function shouldSplitByFunction(screen: ScreenAnalysis, inputCount: number): boolean {
  if (!isQueryLikeScreen(screen)) return false;
  const featureCount = screen.features?.length ?? 0;
  return inputCount > 1 || featureCount >= 2;
}

type OrderedField = InputFinding & { target: string };

function findInputForFeature(featureTitle: string, ordered: OrderedField[]) {
  const key = canonicalTarget(featureTitle);
  return ordered.find((input) => canonicalTarget(input.target) === key);
}

function enrichField(field: OrderedField, feature?: ScreenFeature): TcInput {
  const context = `${field.target} ${field.constraint} ${feature?.body ?? ""} ${feature?.title ?? ""}`;
  const options =
    field.options?.length ? field.options : parseOptionList(context);
  const control =
    parseControlKind(field.control) ??
    inferControlKind(context, options);
  let value = "";
  if (control === CONTROL_KIND.dateRange) value = defaultDateRangeValue();
  else if (control === CONTROL_KIND.date)
    value = new Date().toISOString().slice(0, 10);
  else if (control !== CONTROL_KIND.text && options?.length)
    value = defaultOptionValue(options, pickOptionHint(feature, field));
  return {
    target: field.target,
    value,
    control,
    ...(options?.length ? { options } : {}),
  };
}

function pickOptionHint(feature?: ScreenFeature, field?: OrderedField): string | undefined {
  const blob = `${feature?.body ?? ""} ${field?.constraint ?? ""}`;
  const match = blob.match(/(?:예|예시|선택)\s*[:：]?\s*(남성|여성|전체|Y|N)/u);
  return match?.[1];
}

function toTcInput(field: OrderedField, feature?: ScreenFeature): TcInput {
  return enrichField(field, feature);
}

function featureNeedsButton(feature: ScreenFeature, hasMatchedInput: boolean): boolean {
  if (hasMatchedInput) return true;
  return /조회|검색|초기화|적용|필터/u.test(`${feature.title} ${feature.body}`);
}

function expectedForFeature(feature: ScreenFeature, fallback: string): string {
  // successText(fallback)가 있으면 항상 우선 사용한다.
  // feature.body는 기능 설명 문장이므로 화면 검증 문구로 쓰기에 부적합한 경우가 많다.
  if (fallback.trim()) return fallback.trim();
  const body = feature.body.trim();
  // 따옴표로 감싸인 짧은 성공·에러 문구가 있으면 그것만 쓴다
  const quoted = body.match(/[「『"'"]([^」』"'"]{2,30})[」』"'"]/u);
  if (quoted?.[1]) return quoted[1].trim();
  // 기능 설명 본문이 화면에 실제 노출될 짧은 이름·제목 수준(15자 이하)이면 쓴다
  if (body.length >= 2 && body.length <= 15) return body;
  // 그 외에는 feature.title을 쓴다
  return feature.title.trim();
}

function pushPerInputSuccessCases(input: {
  screen: ScreenAnalysis;
  ordered: OrderedField[];
  buttonName: string;
  cases: TestCase[];
}): void {
  const seen = new Set<string>();
  let index = 0;
  for (const field of input.ordered) {
    if (seen.has(field.target)) continue;
    seen.add(field.target);
    index += 1;
    input.cases.push({
      id: `${input.screen.screenKey}-success-${index}`,
      screenName: input.screen.screenName,
      kind: TC_KIND.success,
      title: `${input.screen.screenName} · ${field.target}`,
      inputs: [toTcInput(field)],
      buttonName: input.buttonName,
      expectedText: input.screen.successText,
    });
  }
}

function pushPerFeatureSuccessCases(input: {
  screen: ScreenAnalysis;
  ordered: OrderedField[];
  buttonName: string;
  cases: TestCase[];
}): void {
  const features = input.screen.features ?? [];
  let index = 0;
  for (const feature of features) {
    index += 1;
    const matched = findInputForFeature(feature.title, input.ordered);
    const needsButton = featureNeedsButton(feature, Boolean(matched));
    input.cases.push({
      id: `${input.screen.screenKey}-success-${index}`,
      screenName: input.screen.screenName,
      kind: TC_KIND.success,
      title: `${input.screen.screenName} · ${feature.title}`,
      inputs: matched ? [toTcInput(matched, feature)] : [],
      buttonName: needsButton ? input.buttonName : "",
      expectedText: expectedForFeature(feature, input.screen.successText),
    });
  }
}

export function buildTestCases(screens: ScreenAnalysis[]): TestCase[] {
  const cases: TestCase[] = [];
  for (const screen of screens) {
    const ordered = [...screen.inputs]
      .map((input) => ({ ...input, target: canonicalTarget(input.target) }))
      .sort((left, right) => fieldOrder(left.target) - fieldOrder(right.target));
    const split = shouldSplitByFunction(screen, ordered.length);
    const buttonName = screen.buttonName.trim() || (split ? "조회" : "로그인");
    const featureCount = screen.features?.length ?? 0;

    if (screen.successText && split && featureCount >= 2) {
      pushPerFeatureSuccessCases({ screen, ordered, buttonName, cases });
    } else if (screen.successText && split) {
      pushPerInputSuccessCases({ screen, ordered, buttonName, cases });
    } else if (screen.successText && !isQueryLikeScreen(screen)) {
      const seen = new Set<string>();
      const inputs: TcInput[] = [];
      for (const field of ordered) {
        if (seen.has(field.target)) continue;
        seen.add(field.target);
        inputs.push(toTcInput(field));
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
    } else if (screen.successText && ordered.length === 1) {
      cases.push({
        id: `${screen.screenKey}-success-1`,
        screenName: screen.screenName,
        kind: TC_KIND.success,
        title: `${screen.screenName} · ${ordered[0]?.target ?? "조회"}`,
        inputs: [toTcInput(ordered[0] ?? { target: "조건", constraint: "", warning: "", failureExample: "" })],
        buttonName,
        expectedText: screen.successText,
      });
    }

    const seenFailures = new Set<string>();
    for (const field of ordered) {
      if (!field.warning) continue;
      const key = `${field.target}|${field.warning}`;
      if (seenFailures.has(key)) continue;
      seenFailures.add(key);
      cases.push({
        id: `${screen.screenKey}-failure-${cases.length + 1}`,
        screenName: screen.screenName,
        kind: TC_KIND.failure,
        title: `${screen.screenName} 실패 · ${field.target}`,
        inputs: [{
          ...toTcInput(field),
          value: failureInputValue(
            { target: field.target, value: field.failureExample },
            field.warning,
            field.constraint,
          ),
        }],
        buttonName,
        expectedText: field.warning,
      });
    }

    let checkIndex = 0;
    for (const feature of screen.features ?? []) {
      if (coveredByCase(feature, screen, cases, split)) continue;
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

function coveredByCase(
  feature: ScreenFeature,
  screen: ScreenAnalysis,
  cases: TestCase[],
  split: boolean,
): boolean {
  const title = canonicalTarget(feature.title);
  if (cases.some((item) => item.inputs.some((input) => input.target === title))) return true;
  if (cases.some((item) => item.title.endsWith(`· ${feature.title}`))) return true;
  if (cases.some((item) => item.title.endsWith(`· ${title}`))) return true;
  const bundled = cases.some(
    (item) => item.kind === TC_KIND.success && item.id.endsWith("-success"),
  );
  if (!split && bundled && /성공|이동/u.test(`${feature.title} ${feature.body}`)) return true;
  return screen.inputs.some((input) => input.warning && feature.body.includes(input.warning));
}
