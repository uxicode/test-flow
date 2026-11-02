import type { InputFinding, ScreenAnalysis } from "./types.js";
import { normalizePhrase } from "./keep-spec-warnings.js";

/** 값을 보여 주기만 한다는 뜻의 표현. 단독 `조회`는 검색 조건(`이름으로 조회`)에, `표시형식`은 입력 칸의 형식 설명에도 쓰여 뺀다. */
const DISPLAY_ONLY = /제공|표시(?!\s*형식)|확인\s*가능|노출|출력|보여|조회\s*영역|결과\s*조회/u;
/** 사용자가 값을 넣거나 고른다는 뜻의 표현. */
const USER_INPUT = /입력|선택|검색|필터|첨부|업로드|체크|작성|등록|수정|기간|클릭|버튼/u;

const DATE_LIKE = /^\d{4}[-./]\d{1,2}([-./]\d{1,2})?$/u;
const NO_OPTION_CONTROLS = new Set(["text", "password", "textarea", "date", "date_range", "file"]);

/** 질문 본문이 조회·표시만 설명하고 입력 행위는 말하지 않는지. */
export function isDisplayOnlyQuestion(questionText: string): boolean {
  return DISPLAY_ONLY.test(questionText) && !USER_INPUT.test(questionText);
}

function cleanOptions(input: InputFinding, questionText: string): InputFinding {
  const options = input.options ?? [];
  if (options.length === 0) return input;
  const control = input.control ?? "text";
  if (NO_OPTION_CONTROLS.has(control)) {
    const { options: _dropped, ...rest } = input;
    return rest;
  }
  const spec = normalizePhrase(questionText);
  const invented = options.every(
    (option) => DATE_LIKE.test(option.trim()) && !spec.includes(normalizePhrase(option)),
  );
  if (!invented) return input;
  const { options: _dropped, ...rest } = input;
  return { ...rest, control: "date" };
}

/**
 * 모델이 지어낸 입력을 걸러낸다.
 * - 조회·표시만 설명하는 질문의 입력은 모두 버린다 (수치 카드, 결과 표 등).
 * - 날짜 모양 선택지를 기획서에 없이 만들어 낸 항목은 날짜 입력으로 바로잡는다.
 * - 선택지를 가질 수 없는 컨트롤(text 등)의 선택지는 비운다.
 */
export function keepRealInputs(analysis: ScreenAnalysis, questionText: string): ScreenAnalysis {
  if (isDisplayOnlyQuestion(questionText)) return { ...analysis, inputs: [] };
  return {
    ...analysis,
    inputs: analysis.inputs.map((input) => cleanOptions(input, questionText)),
  };
}
