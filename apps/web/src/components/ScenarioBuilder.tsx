import React, { useState } from "react";
import {
  EXAMPLE_SCENARIO,
  STEP_LABELS,
  STEP_TYPES,
  createStep,
  type Step,
  type StepType,
} from "../types";
import { ScriptEditor } from "./ScriptEditor";
import { StepItem } from "./StepItem";
import { MdImportModal } from "./MdImportModal";

interface Props {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  rawScript: string;
  onRawScriptChange: (rawScript: string) => void;
  onRun?: () => void;
  onStartSimulator?: () => void;
  isSimulating?: boolean;
  canRun?: boolean;
  isStarting?: boolean;
  isRunning?: boolean;
  activeStepId?: string | null;
}

function InsertStepDivider({
  onInsert,
  defaultType,
}: {
  onInsert: (type: StepType) => void;
  defaultType: StepType;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedType, setSelectedType] = useState<StepType>(defaultType);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group/divider relative flex h-3 w-full cursor-pointer items-center justify-center my-0.5"
    >
      {/* 라인 */}
      <div
        className={`h-[1px] w-full transition-colors ${isHovered ? "bg-sky-500/80" : "bg-transparent group-hover/divider:bg-slate-700/40"
          }`}
      />

      {/* 삽입 컨트롤 */}
      {isHovered ? (
        <div className="absolute z-20 flex items-center gap-1.5 rounded-full border border-sky-500/70 bg-slate-900 px-2 py-0.5 shadow-lg backdrop-blur-sm">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as StepType)}
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none"
          >
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {STEP_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInsert(selectedType);
            }}
            className="flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap"
          >
            + 여기에 추가
          </button>
        </div>
      ) : (
        <div className="absolute opacity-0 group-hover/divider:opacity-100 transition-opacity">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-300 shadow">
            +
          </span>
        </div>
      )}
    </div>
  );
}

export function ScenarioBuilder({
  steps,
  onChange,
  rawScript,
  onRawScriptChange,
  onRun,
  onStartSimulator,
  isSimulating = false,
  canRun = true,
  isStarting = false,
  isRunning = false,
  activeStepId = null,
}: Props) {
  const [addType, setAddType] = useState<StepType>("goto");
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [isMdImportOpen, setIsMdImportOpen] = useState(false);

  function handleApplyMdSteps(newSteps: Step[], mode: "append" | "replace") {
    if (mode === "append") {
      onChange([...steps, ...newSteps]);
    } else {
      onChange(newSteps);
    }
  }

  function insertStepAt(index: number, type: StepType = addType) {
    const newStepItem = createStep(type);
    const next = [...steps];
    next.splice(index, 0, newStepItem);
    onChange(next);
  }

  function applyBaseUrl() {
    if (!baseUrl.trim()) return;
    const cleanBase = baseUrl.trim().replace(/\/+$/, "");
    const updatedSteps = steps.map((step) => {
      if (step.type === "goto" || step.type === "api_request") {
        let path = step.selectorValue.trim();
        if (path.startsWith("http://") || path.startsWith("https://")) {
          try {
            const urlObj = new URL(path);
            path = urlObj.pathname + urlObj.search + urlObj.hash;
          } catch {
            /* ignore invalid URL */
          }
        }
        if (!path.startsWith("/")) path = "/" + path;
        const fullUrl = cleanBase + path;
        if (step.type === "goto") {
          return {
            ...step,
            selectorValue: fullUrl,
            label: `페이지 이동: ${fullUrl}`,
          };
        } else {
          const method = step.inputValue || "GET";
          return {
            ...step,
            selectorValue: fullUrl,
            label: `API 응답 검증: ${method} ${fullUrl}`,
          };
        }
      }
      return step;
    });
    onChange(updatedSteps);
  }

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMdImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <span>📝 .md 텍스트로 플로우 반영</span>
          </button>
          <button
            type="button"
            onClick={loadExample}
            className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors"
          >
            예제 불러오기
          </button>
        </div>
      </div>

      {/* 시뮬레이터 구동 중 바 */}
      {isSimulating && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-500/40 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 p-3 shadow-lg backdrop-blur-sm animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                🎬 새 창 브라우저 헤디드 시뮬레이터 구동 중
              </span>
              <span className="text-[11px] text-sky-300 font-medium">
                열린 Chromium 브라우저에서 시나리오 스텝별 가상 커서 이동 및 콘솔 디버깅을 실행하고 있습니다.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Base URL 설정 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
        <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
          기본 Base URL:
        </span>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="예: http://localhost:3000 또는 https://example.com"
          className="flex-1 min-w-[200px] rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={applyBaseUrl}
          className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 transition-colors whitespace-nowrap"
          title="모든 상대 경로 페이지 이동 및 API 요청 검증 스텝에 Base URL을 결합합니다"
        >
          Base URL 일괄 적용
        </button>
      </div>

      {/* 스텝 목록 */}
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-sm text-slate-500">
          아래에서 스텝 유형을 선택하고 <span className="text-slate-400">+ 추가</span> 버튼을 누르세요.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              {i === 0 && (
                <InsertStepDivider
                  onInsert={(type) => insertStepAt(0, type)}
                  defaultType={addType}
                />
              )}
              <StepItem
                step={step}
                index={i}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                isHighlighted={activeStepId === step.id}
                onChange={(updated) => updateStep(i, updated)}
                onRemove={() => removeStep(i)}
                onMoveUp={() => moveUp(i)}
                onMoveDown={() => moveDown(i)}
              />
              <InsertStepDivider
                onInsert={(type) => insertStepAt(i + 1, type)}
                defaultType={addType}
              />
            </React.Fragment>
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
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
          >
            내용 전체 삭제
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onStartSimulator && (
            <button
              type="button"
              onClick={onStartSimulator}
              disabled={isRunning || isSimulating || steps.length === 0}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5"
              title="실제 Chromium 새 창 브라우저를 오픈하여 시나리오 빌더 스텝대로 가상 포인터 및 콘솔 디버깅을 시퀀셜하게 자동 실행합니다"
            >
              <span>🎬 스텝 시뮬레이터 자동 실행 (새창 브라우저)</span>
            </button>
          )}
          {onRun && (
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning || !canRun || isSimulating}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? "시작 중…" : "일괄 테스트 실행"}
            </button>
          )}
        </div>
      </div>

      {/* 스텝 개수 안내 */}
      {steps.length > 0 && (
        <p className="text-xs text-slate-600">
          {steps.length}개 스텝 구성됨
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Playwright 스크립트
        </h3>
        <ScriptEditor value={rawScript} onChange={onRawScriptChange} />
      </div>

      <MdImportModal
        open={isMdImportOpen}
        onClose={() => setIsMdImportOpen(false)}
        onApply={handleApplyMdSteps}
        existingStepCount={steps.length}
      />
    </section>
  );
}
