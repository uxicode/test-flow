import { useState, useRef, useCallback } from "react";
import type { Step } from "../types";

export interface SimulatorState {
  isSimulating: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  currentStepId: string | null;
  statusMessage: string;
}

export function useScenarioSimulator(steps: Step[], onStepExecute?: (step: Step, index: number) => void) {
  const [state, setState] = useState<SimulatorState>({
    isSimulating: false,
    isPaused: false,
    currentStepIndex: -1,
    currentStepId: null,
    statusMessage: "",
  });

  const timerRef = useRef<number | null>(null);
  const stepsRef = useRef<Step[]>(steps);
  stepsRef.current = steps;

  const isPausedRef = useRef(false);
  isPausedRef.current = state.isPaused;

  const stopSimulation = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState({
      isSimulating: false,
      isPaused: false,
      currentStepIndex: -1,
      currentStepId: null,
      statusMessage: "시뮬레이션 종료",
    });
  }, []);

  const runNextStep = useCallback((index: number) => {
    const list = stepsRef.current;
    if (index >= list.length) {
      setState({
        isSimulating: false,
        isPaused: false,
        currentStepIndex: -1,
        currentStepId: null,
        statusMessage: "🎉 모든 시나리오 스텝 자동화 디버깅 완료!",
      });
      return;
    }

    const step = list[index];
    setState({
      isSimulating: true,
      isPaused: false,
      currentStepIndex: index,
      currentStepId: step.id,
      statusMessage: `[Step ${index + 1}/${list.length}] "${step.label || step.selectorValue || step.type}" 실행 중…`,
    });

    if (onStepExecute) {
      onStepExecute(step, index);
    }

    // Step duration: wait step gets custom time, others get 1500ms for visible animation pacing
    let delay = 1500;
    if (step.type === "wait_ms" && step.waitMs) {
      delay = Math.max(step.waitMs, 800);
    }

    timerRef.current = window.setTimeout(() => {
      if (!isPausedRef.current) {
        runNextStep(index + 1);
      }
    }, delay);
  }, [onStepExecute]);

  const startSimulation = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);

    runNextStep(0);
  }, [runNextStep]);

  const togglePause = useCallback(() => {
    setState((prev) => {
      const nextPaused = !prev.isPaused;
      isPausedRef.current = nextPaused;
      if (!nextPaused && prev.currentStepIndex >= 0) {
        // Resume simulation
        runNextStep(prev.currentStepIndex);
      }
      return {
        ...prev,
        isPaused: nextPaused,
        statusMessage: nextPaused ? "⏸ 시뮬레이션 일시정지됨" : prev.statusMessage,
      };
    });
  }, [runNextStep]);

  return {
    ...state,
    startSimulation,
    stopSimulation,
    togglePause,
  };
}
