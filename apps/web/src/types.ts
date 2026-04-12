export const STEP_TYPES = [
  "goto",
  "click",
  "fill",
  "check",
  "assert_visible",
  "assert_hidden",
  "assert_text",
  "wait_ms",
  "wait_for_selector",
  "screenshot",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export const SELECTOR_STRATEGIES = [
  "text",
  "role",
  "label",
  "placeholder",
  "css",
  "testid",
] as const;

export type SelectorStrategy = (typeof SELECTOR_STRATEGIES)[number];

export const ARIA_ROLES = [
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "heading",
  "img",
  "listitem",
  "menuitem",
  "tab",
] as const;

export type AriaRole = (typeof ARIA_ROLES)[number];

export interface Step {
  id: string;
  type: StepType;
  selectorStrategy: SelectorStrategy;
  selectorValue: string;
  role: AriaRole;
  inputValue: string;
  waitMs: number;
  label: string;
}

export const STEP_LABELS: Record<StepType, string> = {
  goto: "페이지 이동",
  click: "클릭",
  fill: "텍스트 입력",
  check: "체크박스 선택",
  assert_visible: "표시 확인",
  assert_hidden: "숨김 확인",
  assert_text: "텍스트 확인",
  wait_ms: "대기 (ms)",
  wait_for_selector: "요소 대기",
  screenshot: "스크린샷",
};

export const STEP_COLORS: Record<StepType, string> = {
  goto: "bg-sky-900/60 text-sky-200",
  click: "bg-violet-900/60 text-violet-200",
  fill: "bg-amber-900/60 text-amber-200",
  check: "bg-amber-900/60 text-amber-200",
  assert_visible: "bg-emerald-900/60 text-emerald-200",
  assert_hidden: "bg-rose-900/60 text-rose-200",
  assert_text: "bg-emerald-900/60 text-emerald-200",
  wait_ms: "bg-slate-700/60 text-slate-300",
  wait_for_selector: "bg-slate-700/60 text-slate-300",
  screenshot: "bg-pink-900/60 text-pink-200",
};

export const SELECTOR_LABELS: Record<SelectorStrategy, string> = {
  text: "텍스트",
  role: "역할",
  label: "레이블",
  placeholder: "플레이스홀더",
  css: "CSS 선택자",
  testid: "테스트 ID",
};

export function createStep(type: StepType): Step {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    selectorStrategy: "text",
    selectorValue: "",
    role: "button",
    inputValue: "",
    waitMs: 1000,
    label: "",
  };
}

function isStepType(t: string): t is StepType {
  return (STEP_TYPES as readonly string[]).includes(t);
}

function isSelectorStrategy(s: string): s is SelectorStrategy {
  return (SELECTOR_STRATEGIES as readonly string[]).includes(s);
}

function isAriaRole(r: string): r is AriaRole {
  return (ARIA_ROLES as readonly string[]).includes(r);
}

/** Normalize API/recording JSON into a ScenarioBuilder Step. */
export function normalizeStepFromApi(raw: Record<string, unknown>): Step {
  const type =
    typeof raw.type === "string" && isStepType(raw.type) ? raw.type : "goto";
  const base = createStep(type);
  const strat =
    typeof raw.selectorStrategy === "string" && isSelectorStrategy(raw.selectorStrategy)
      ? raw.selectorStrategy
      : base.selectorStrategy;
  const roleRaw = typeof raw.role === "string" ? raw.role : "button";
  const role = isAriaRole(roleRaw) ? roleRaw : "button";
  return {
    ...base,
    id: typeof raw.id === "string" ? raw.id : base.id,
    type,
    selectorStrategy: strat,
    selectorValue: typeof raw.selectorValue === "string" ? raw.selectorValue : "",
    role,
    inputValue: typeof raw.inputValue === "string" ? raw.inputValue : "",
    waitMs: typeof raw.waitMs === "number" ? raw.waitMs : base.waitMs,
    label: typeof raw.label === "string" ? raw.label : "",
  };
}

export const EXAMPLE_SCENARIO: Step[] = [
  { ...createStep("goto"), selectorValue: "https://example.com" },
  {
    ...createStep("assert_visible"),
    selectorStrategy: "text",
    selectorValue: "Example Domain",
  },
  { ...createStep("screenshot"), label: "homepage" },
];

export type EditorMode = "builder" | "script";

export interface ScenarioSummary {
  id: string;
  name: string;
  mode: EditorMode;
  updatedAt: string;
}

export interface Scenario extends ScenarioSummary {
  steps: Step[];
  rawScript: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// SmartTC — 지능형 TC 변환 결과
// ---------------------------------------------------------------------------

export type SmartTCAction =
  | "navigate"
  | "click"
  | "fill"
  | "check"
  | "assert"
  | "wait"
  | "screenshot";

export interface SmartTC {
  step: number;
  action: SmartTCAction;
  target: string;
  description: string;
  selector: string;
}
