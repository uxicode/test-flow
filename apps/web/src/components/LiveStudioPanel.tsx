import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStepFromApi,
  SELECTOR_LABELS,
  SELECTOR_STRATEGIES,
  STEP_LABELS,
  STEP_TYPES,
  type SelectorStrategy,
  type Step,
  type StepType,
} from "../types";
import { generateSpec, stepToLine } from "../utils/generateSpec";

interface Props {
  sessionId: string;
  recordUrl: string;
  onStop: () => void;
}

type OutgoingMessage =
  | { type: "patch"; id: string; patch: Partial<Step> }
  | { type: "delete"; id: string }
  | { type: "add"; step: Partial<Step> & { type: StepType }; atIndex?: number }
  | { type: "reorder"; ids: string[] }
  | { type: "undo" }
  | { type: "redo" };

interface IncomingSnapshot {
  type: "snapshot";
  steps: unknown[];
}
interface IncomingStepAdded {
  type: "step:added";
  step: unknown;
}
interface IncomingClosed {
  type: "closed";
  reason?: string;
}
type IncomingMessage = IncomingSnapshot | IncomingStepAdded | IncomingClosed;

function normalizeList(raw: unknown[]): Step[] {
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => normalizeStepFromApi(x));
}

export function LiveStudioPanel({ sessionId, recordUrl, onStop }: Props) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const patchTimers = useRef<Map<string, number>>(new Map());

  const send = useCallback((msg: OutgoingMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/sessions/record/${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setClosed((prev) => prev ?? "disconnected");
    };
    ws.onerror = () => {
      setConnected(false);
    };
    ws.onmessage = (ev) => {
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(ev.data as string) as IncomingMessage;
      } catch {
        return;
      }
      if (parsed.type === "snapshot") {
        setSteps(normalizeList(parsed.steps));
      } else if (parsed.type === "step:added") {
        if (typeof parsed.step === "object" && parsed.step !== null) {
          const step = normalizeStepFromApi(parsed.step as Record<string, unknown>);
          setSteps((prev) => {
            if (prev.some((s) => s.id === step.id)) return prev;
            return [...prev, step];
          });
        }
      } else if (parsed.type === "closed") {
        setClosed(parsed.reason ?? "closed");
      }
    };

    return () => {
      wsRef.current = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      /* flush pending debounce timers */
      for (const t of patchTimers.current.values()) window.clearTimeout(t);
      patchTimers.current.clear();
    };
  }, [sessionId]);

  const codePreview = useMemo(() => generateSpec(steps), [steps]);
  const selectedIndex = useMemo(
    () => (selectedId ? steps.findIndex((s) => s.id === selectedId) : -1),
    [steps, selectedId],
  );

  /** 인라인 편집: 로컬 상태는 즉시 갱신하고 서버 patch는 200ms 디바운스 */
  const editStep = useCallback(
    (id: string, patch: Partial<Step>) => {
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      const timers = patchTimers.current;
      const prev = timers.get(id);
      if (prev) window.clearTimeout(prev);
      const handle = window.setTimeout(() => {
        send({ type: "patch", id, patch });
        timers.delete(id);
      }, 200);
      timers.set(id, handle);
    },
    [send],
  );

  const deleteStep = useCallback(
    (id: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      send({ type: "delete", id });
    },
    [send, selectedId],
  );

  const addStep = useCallback(
    (type: StepType, partial: Partial<Step> = {}) => {
      const atIndex = selectedIndex >= 0 ? selectedIndex + 1 : undefined;
      send({ type: "add", step: { type, ...partial }, atIndex });
    },
    [send, selectedIndex],
  );

  const reorderStepId = useCallback(
    (fromId: string, toId: string, position: "before" | "after") => {
      setSteps((prev) => {
        const fromIdx = prev.findIndex((s) => s.id === fromId);
        const toIdx = prev.findIndex((s) => s.id === toId);
        if (fromIdx < 0 || toIdx < 0 || fromId === toId) return prev;
        const without = prev.filter((s) => s.id !== fromId);
        let insertAt = without.findIndex((s) => s.id === toId);
        if (position === "after") insertAt += 1;
        const next = [
          ...without.slice(0, insertAt),
          prev[fromIdx],
          ...without.slice(insertAt),
        ];
        send({ type: "reorder", ids: next.map((s) => s.id) });
        return next;
      });
    },
    [send],
  );

  const handleUndo = useCallback(() => send({ type: "undo" }), [send]);
  const handleRedo = useCallback(() => send({ type: "redo" }), [send]);

  const toolbarButtonClass =
    "rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-900/50 bg-gradient-to-b from-violet-950/30 to-slate-950/30 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-violet-200">
            실시간 녹화 스튜디오
            <span className="ml-2 rounded-full border border-violet-700/60 bg-violet-900/30 px-2 py-0.5 align-middle text-[10px] font-medium text-violet-200">
              {connected ? "연결됨" : closed ? "종료됨" : "연결 중"}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Chromium에서 조작하면 왼쪽 목록과 오른쪽 Playwright 코드가 실시간으로 동기화됩니다. 각 스텝은
            인라인으로 조정·삭제·재정렬할 수 있고, 수동 스텝(goto/wait/assert/screenshot)도 중간에 삽입할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={toolbarButtonClass} onClick={handleUndo}>
            되돌리기
          </button>
          <button type="button" className={toolbarButtonClass} onClick={handleRedo}>
            다시하기
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => addStep("goto", { selectorStrategy: "css", selectorValue: recordUrl })}
          >
            + goto
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => addStep("wait_ms", { waitMs: 1000 })}
          >
            + wait
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => addStep("assert_visible", { selectorStrategy: "text" })}
          >
            + assert:visible
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => addStep("screenshot")}
          >
            + screenshot
          </button>
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
          >
            녹화 종료
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>기록된 스텝 ({steps.length})</span>
            {selectedIndex >= 0 ? (
              <span>현재 선택: {selectedIndex + 1}번째 다음에 삽입</span>
            ) : (
              <span>스텝을 클릭하면 수동 추가 위치로 지정됩니다</span>
            )}
          </div>
          <ol className="flex flex-col gap-2">
            {steps.length === 0 ? (
              <li className="rounded border border-dashed border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-500">
                아직 기록된 스텝이 없습니다. 열린 브라우저에서 요소를 클릭하거나 입력하면 여기에 즉시 나타납니다.
              </li>
            ) : null}
            {steps.map((step, idx) => {
              const isSelected = step.id === selectedId;
              const isDragging = step.id === dragId;
              return (
                <li
                  key={step.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(step.id);
                    try {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", step.id);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (!dragId || dragId === step.id) return;
                    e.preventDefault();
                    try {
                      e.dataTransfer.dropEffect = "move";
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDrop={(e) => {
                    if (!dragId || dragId === step.id) return;
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const pos: "before" | "after" =
                      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    reorderStepId(dragId, step.id, pos);
                    setDragId(null);
                  }}
                  onClick={() => setSelectedId(step.id)}
                  className={`cursor-pointer rounded border p-3 text-xs ${
                    isSelected
                      ? "border-violet-500 bg-violet-950/40"
                      : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  } ${isDragging ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab select-none text-slate-600" title="드래그로 순서 변경">
                        ⋮⋮
                      </span>
                      <span className="text-[10px] font-mono text-slate-600">#{idx + 1}</span>
                      <select
                        value={step.type}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          editStep(step.id, { type: e.target.value as StepType })
                        }
                        className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-200"
                      >
                        {STEP_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {STEP_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStep(step.id);
                      }}
                      className="rounded px-1.5 py-0.5 text-[11px] text-rose-300 hover:bg-rose-950/60"
                    >
                      삭제
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">전략</span>
                      <select
                        value={step.selectorStrategy}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          editStep(step.id, {
                            selectorStrategy: e.target.value as SelectorStrategy,
                          })
                        }
                        className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                      >
                        {SELECTOR_STRATEGIES.map((s) => (
                          <option key={s} value={s}>
                            {SELECTOR_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">선택자 값</span>
                      <input
                        value={step.selectorValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => editStep(step.id, { selectorValue: e.target.value })}
                        className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-[11px] text-slate-200"
                        placeholder="selector / URL"
                      />
                    </label>
                    {step.type === "fill" ||
                    step.type === "assert_text" ? (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {step.type === "fill" ? "입력 값" : "기대 텍스트"}
                        </span>
                        <input
                          value={step.inputValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => editStep(step.id, { inputValue: e.target.value })}
                          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                        />
                      </label>
                    ) : null}
                    {step.type === "wait_ms" ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">대기(ms)</span>
                        <input
                          type="number"
                          min={0}
                          value={step.waitMs}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            editStep(step.id, { waitMs: Number(e.target.value) || 0 })
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                        />
                      </label>
                    ) : null}
                    {step.type === "screenshot" ? (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">라벨</span>
                        <input
                          value={step.label}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => editStep(step.id, { label: e.target.value })}
                          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                        />
                      </label>
                    ) : null}
                  </div>

                  <pre className="mt-2 overflow-auto rounded bg-slate-950/70 px-2 py-1 font-mono text-[11px] leading-relaxed text-emerald-200">
{stepToLine(step)}
                  </pre>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Playwright 코드 (실시간)</span>
            <span>{steps.length}개 스텝</span>
          </div>
          <pre className="h-[520px] overflow-auto rounded border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
            {codePreview}
          </pre>
        </div>
      </div>
    </section>
  );
}
