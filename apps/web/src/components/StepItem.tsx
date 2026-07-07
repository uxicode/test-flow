import type { AriaRole, SelectorStrategy, Step, StepType } from "../types";
import {
  ARIA_ROLES,
  SELECTOR_LABELS,
  SELECTOR_STRATEGIES,
  STEP_COLORS,
  STEP_LABELS,
  STEP_TYPES,
} from "../types";

interface Props {
  step: Step;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const inputCls =
  "w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none";
const selectCls =
  "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none";
const iconBtnCls =
  "rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors";

function needsSelector(type: StepType): boolean {
  return !["goto", "wait_ms", "screenshot"].includes(type);
}

function needsInputValue(type: StepType): boolean {
  return type === "fill" || type === "assert_text";
}

function inputValueLabel(type: StepType): string {
  return type === "assert_text" ? "기대 텍스트" : "입력할 텍스트";
}

function selectorPlaceholder(strategy: SelectorStrategy): string {
  switch (strategy) {
    case "css":
      return "#id, .class, [attr=value]";
    case "role":
      return "접근성 이름 (예: 로그인)";
    case "text":
      return "표시 텍스트 (예: 로그인)";
    case "label":
      return "레이블 텍스트 (예: 이메일)";
    case "placeholder":
      return "플레이스홀더에 보이는 문구";
    case "testid":
      return "data-testid 값";
  }
}

export function StepItem({
  step,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const update = (patch: Partial<Step>) => onChange({ ...step, ...patch });

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-800/50 p-3 transition-colors hover:border-slate-600">
      {/* 스텝 번호 */}
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
        {index + 1}
      </span>

      {/* 필드 */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* 상단 행: 유형 + 주요 필드 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 유형 배지/선택 */}
          <select
            value={step.type}
            onChange={(e) => update({ type: e.target.value as StepType })}
            className={`rounded px-2 py-1 text-xs font-semibold focus:outline-none ${STEP_COLORS[step.type]} border-0 cursor-pointer`}
          >
            {STEP_TYPES.map((t) => (
              <option
                key={t}
                value={t}
                className="bg-slate-900 font-normal text-slate-200"
              >
                {STEP_LABELS[t]}
              </option>
            ))}
          </select>

          {/* 페이지 이동(goto): URL */}
          {step.type === "goto" && (
            <input
              type="url"
              placeholder="https://example.com"
              value={step.selectorValue}
              onChange={(e) => update({ selectorValue: e.target.value })}
              className={`${inputCls} min-w-[200px] flex-1`}
            />
          )}

          {/* wait_ms: 밀리초 */}
          {step.type === "wait_ms" && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={100}
                value={step.waitMs}
                onChange={(e) => update({ waitMs: Number(e.target.value) })}
                className={`${inputCls} w-24`}
              />
              <span className="text-xs text-slate-500">ms</span>
            </div>
          )}

          {/* screenshot: 레이블 */}
          {step.type === "screenshot" && (
            <input
              type="text"
              placeholder="레이블 (선택)"
              value={step.label}
              onChange={(e) => update({ label: e.target.value })}
              className={`${inputCls} w-44`}
            />
          )}

          {/* 셀렉터 기반: 전략 + (role) + 값 */}
          {needsSelector(step.type) && (
            <>
              <select
                value={step.selectorStrategy}
                onChange={(e) =>
                  update({ selectorStrategy: e.target.value as SelectorStrategy })
                }
                className={selectCls}
              >
                {SELECTOR_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {SELECTOR_LABELS[s]}
                  </option>
                ))}
              </select>

              {step.selectorStrategy === "role" && (
                <select
                  value={step.role}
                  onChange={(e) => update({ role: e.target.value as AriaRole })}
                  className={selectCls}
                >
                  {ARIA_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}

              <input
                type="text"
                placeholder={selectorPlaceholder(step.selectorStrategy)}
                value={step.selectorValue}
                onChange={(e) => update({ selectorValue: e.target.value })}
                className={`${inputCls} min-w-[160px] flex-1`}
              />
            </>
          )}
        </div>

        {/* 하단 행: fill / assert_text 입력 값 */}
        {needsInputValue(step.type) && (
          <input
            type="text"
            placeholder={inputValueLabel(step.type)}
            value={step.inputValue}
            onChange={(e) => update({ inputValue: e.target.value })}
            className={inputCls}
          />
        )}
      </div>

      {/* 동작 버튼 */}
      <div className="flex flex-shrink-0 items-center gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className={iconBtnCls}
          title="위로"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className={iconBtnCls}
          title="아래로"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={`${iconBtnCls} hover:text-rose-400`}
          title="삭제"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
