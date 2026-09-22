import { TC_KIND, type TestCase, type TcInput } from "@testflow/tc";

const ACCOUNT_FIELD = /이메일|아이디|비밀번호|패스워드|email|password/iu;

export function needsSharedLogin(
  testCase: Pick<TestCase, "kind" | "inputs">,
  login: { email: string; password: string } | undefined,
): boolean {
  if (!login?.email.trim() || !login.password.trim()) return false;
  if (testCase.kind === TC_KIND.failure) return false;
  return !testCase.inputs.some((input) => ACCOUNT_FIELD.test(input.target));
}

export function valuesForCase(
  testCase: TestCase,
  provided: Record<string, string>,
): TcInput[] {
  if (testCase.kind === TC_KIND.failure) return testCase.inputs;
  return testCase.inputs.map((input) => {
    const value = provided[input.target]?.trim() ?? "";
    if (!value) throw new Error(`성공 경로의 ${input.target} 값이 비어 있습니다.`);
    return { target: input.target, value };
  });
}
