import {
  defaultOptionValue,
  failureInputValue,
  TC_KIND,
  type TestCase,
  type TcInput,
} from "@testflow/tc";
import { defaultDateRangeValue } from "./date-picker.js";

const ACCOUNT_FIELD = /이메일|아이디|비밀번호|패스워드|email|password/iu;
const LOGIN_NAME = /로그인|log\s?in|sign\s?in/iu;
const LOGIN_PATH = /login|signin|sign-in|auth/iu;

export function isLoginCase(
  testCase: Pick<TestCase, "screenName" | "buttonName" | "inputs">,
): boolean {
  if (testCase.inputs.some((input) => ACCOUNT_FIELD.test(input.target))) return true;
  if (LOGIN_NAME.test(testCase.buttonName)) return true;
  return LOGIN_NAME.test(testCase.screenName);
}

export function isLoginStartUrl(url: string): boolean {
  try {
    return LOGIN_PATH.test(new URL(url).pathname);
  } catch {
    return LOGIN_PATH.test(url);
  }
}

export function needsSharedLogin(
  testCase: Pick<TestCase, "kind" | "inputs" | "screenName" | "buttonName">,
  login: { email: string; password: string } | undefined,
): boolean {
  if (!login?.email.trim() || !login.password.trim()) return false;
  return !isLoginCase(testCase);
}

function resolveSuccessValue(input: TcInput, provided: Record<string, string>): string {
  const typed = provided[input.target]?.trim() ?? "";
  if (typed) return typed;
  const preset = input.value?.trim() ?? "";
  if (preset) return preset;
  if (input.options?.length) return defaultOptionValue(input.options);
  return "";
}

export function valuesForCase(
  testCase: TestCase,
  provided: Record<string, string>,
): TcInput[] {
  if (testCase.kind === TC_KIND.failure) {
    return testCase.inputs.map((input) => ({
      ...input,
      value: failureInputValue(input, testCase.expectedText),
    }));
  }
  return testCase.inputs.map((input) => {
    const value = resolveSuccessValue(input, provided);
    if (!value && input.control === "date_range")
      return { ...input, value: defaultDateRangeValue() };
    if (!value && input.control === "date")
      return { ...input, value: new Date().toISOString().slice(0, 10) };
    if (!value) throw new Error(`성공 경로의 ${input.target} 값이 비어 있습니다.`);
    return { ...input, value };
  });
}
