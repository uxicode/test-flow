import type { Step, SelectorStrategy } from "./scenarioStore.js";

// ---------------------------------------------------------------------------
// SmartTC: 사람이 읽기 쉬운 구조화된 TC 포맷
// ---------------------------------------------------------------------------

export interface SmartTC {
  /** 1-based 순서 번호 */
  step: number;
  /** 액션 종류: navigate | click | fill | check | assert | wait | screenshot */
  action: SmartTCAction;
  /** 사람이 읽기 쉬운 대상 문자열 (URL 또는 요소 설명) */
  target: string;
  /** 한국어 동작 설명 */
  description: string;
  /** Playwright 셀렉터 코드 (page.xxx 형태) */
  selector: string;
}

export type SmartTCAction =
  | "navigate"
  | "click"
  | "fill"
  | "check"
  | "assert"
  | "wait"
  | "screenshot";

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  button: "버튼",
  link: "링크",
  checkbox: "체크박스",
  tab: "탭",
  textbox: "입력 필드",
  menuitem: "메뉴 항목",
  option: "옵션",
  row: "행",
  cell: "셀",
  gridcell: "셀",
  combobox: "콤보박스",
  listbox: "목록",
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role.toLowerCase()] ?? role;
}

function humanTarget(
  strategy: SelectorStrategy | undefined,
  value: string,
  role: string,
): string {
  if (!value) return "요소";
  switch (strategy) {
    case "text":
      return `"${value}" 텍스트 요소`;
    case "role":
      return `"${value}" ${roleLabel(role)}`;
    case "label":
      return `"${value}" 라벨 요소`;
    case "placeholder":
      return `"${value}" 입력 필드`;
    case "testid":
      return `테스트ID "${value}" 요소`;
    case "css":
    default:
      // #id 또는 .class 등 CSS 셀렉터를 그대로 노출
      return value.length > 60 ? value.slice(0, 57) + "..." : value;
  }
}

function selectorCode(
  strategy: SelectorStrategy | undefined,
  value: string,
  role: string,
): string {
  if (!value) return `page.locator("")`;
  const v = JSON.stringify(value);
  switch (strategy) {
    case "text":
      return `page.getByText(${v})`;
    case "role":
      return `page.getByRole(${JSON.stringify(role)}, { name: ${v} })`;
    case "label":
      return `page.getByLabel(${v})`;
    case "placeholder":
      return `page.getByPlaceholder(${v})`;
    case "testid":
      return `page.getByTestId(${v})`;
    case "css":
    default:
      return `page.locator(${v})`;
  }
}

// ---------------------------------------------------------------------------
// 핵심 변환 함수
// ---------------------------------------------------------------------------

export function stepsToSmartTC(steps: Step[]): SmartTC[] {
  return steps.map((step, index) => {
    const strategy = step.selectorStrategy;
    const value = step.selectorValue ?? "";
    const role = step.role ?? "button";
    const target = step.type === "goto" ? value : humanTarget(strategy, value, role);
    const selector = step.type === "goto" ? value : selectorCode(strategy, value, role);

    let action: SmartTCAction;
    let description: string;

    switch (step.type) {
      case "goto":
        action = "navigate";
        description = `"${truncateUrl(value)}" 페이지로 이동`;
        break;

      case "click":
        action = "click";
        description = `${humanTarget(strategy, value, role)} 클릭`;
        break;

      case "fill":
        action = "fill";
        description = `${humanTarget(strategy, value, role)}에 "${step.inputValue ?? ""}" 입력`;
        break;

      case "check":
        action = "check";
        description = `${humanTarget(strategy, value, role)} 체크`;
        break;

      case "assert_visible":
        action = "assert";
        description = `${humanTarget(strategy, value, role)}이(가) 화면에 표시되는지 확인`;
        break;

      case "assert_hidden":
        action = "assert";
        description = `${humanTarget(strategy, value, role)}이(가) 숨겨져 있는지 확인`;
        break;

      case "assert_text":
        action = "assert";
        description = `${humanTarget(strategy, value, role)}의 텍스트가 "${step.inputValue ?? ""}"인지 확인`;
        break;

      case "wait_ms":
        action = "wait";
        description = `${step.waitMs ?? 1000}ms 대기`;
        break;

      case "wait_for_selector":
        action = "wait";
        description = `${humanTarget(strategy, value, role)}이(가) 표시될 때까지 대기`;
        break;

      case "screenshot":
        action = "screenshot";
        description = step.label
          ? `"${step.label}" 스크린샷 캡처`
          : "현재 화면 스크린샷 캡처";
        break;

      default:
        action = "click";
        description = `${step.type} 실행`;
    }

    return {
      step: index + 1,
      action,
      target,
      description,
      selector,
    };
  });
}

// URL에서 JWT 토큰 등 긴 쿼리스트링 제거
function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    // 쿼리스트링이 너무 길면 생략
    const search = u.search.length > 40 ? "?..." : u.search;
    return `${u.host}${pathname}${search}`;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + "..." : url;
  }
}
