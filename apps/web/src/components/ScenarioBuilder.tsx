import { useState } from "react";
import {
  EXAMPLE_SCENARIO,
  STEP_LABELS,
  STEP_TYPES,
  createStep,
  type Step,
  type StepType,
} from "../types";
import { StepItem } from "./StepItem";

interface Props {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

export function ScenarioBuilder({ steps, onChange }: Props) {
  const [addType, setAddType] = useState<StepType>("goto");

  function addStep() {
    onChange([...steps, createStep(addType)]);
  }

  function updateStep(index: number, updated: Step) {
    const next = [...steps];
    next[index] = updated;
    onChange(next);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...steps];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === steps.length - 1) return;
    const next = [...steps];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function loadExample() {
    onChange(
      EXAMPLE_SCENARIO.map((s) => ({
        ...s,
        id: Math.random().toString(36).slice(2, 10),
      })),
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">시나리오 빌더</h2>
        <button
          type="button"
          onClick={loadExample}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors"
        >
          예제 불러오기
        </button>
      </div>

      {/* 스텝 목록 */}
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-sm text-slate-500">
          아래에서 스텝 유형을 선택하고 <span className="text-slate-400">+ 추가</span> 버튼을 누르세요.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <StepItem
              key={step.id}
              step={step}
              index={i}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
              onChange={(updated) => updateStep(i, updated)}
              onRemove={() => removeStep(i)}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
            />
          ))}
        </div>
      )}

      {/* 추가 행 */}
      <div className="flex items-center gap-2">
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value as StepType)}
          className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
        >
          {STEP_TYPES.map((t) => (
            <option key={t} value={t}>
              {STEP_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addStep}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          + 추가
        </button>
        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-auto text-xs text-slate-600 transition-colors hover:text-rose-400"
          >
            전체 삭제
          </button>
        )}
      </div>

      {/* 스텝 개수 안내 */}
      {steps.length > 0 && (
        <p className="text-xs text-slate-600">
          {steps.length}개 스텝 구성됨
        </p>
      )}
    </section>
  );
}
