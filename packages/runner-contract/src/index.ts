export const RUNNER_EVENT = {
  stepStarted: "step_started",
  stepPassed: "step_passed",
  stepFailed: "step_failed",
  log: "log",
  runFinished: "run_finished",
} as const;

export type RunnerEventType =
  (typeof RUNNER_EVENT)[keyof typeof RUNNER_EVENT];

export interface RunnerStep {
  id: string;
  action: string;
  targetHint: string;
  expected: string;
}

export interface StartRunInput {
  runId: string;
  startUrl: string;
  steps: RunnerStep[];
  headed: boolean;
  stopOnFail: true;
  stepTimeoutMs: number;
}

export interface RunnerEvent {
  type: RunnerEventType;
  runId: string;
  stepId?: string;
  message?: string;
  at: string;
}

export type Unsubscribe = () => void;

export interface TestRunner {
  start(input: StartRunInput): Promise<void>;
  stop(runId: string): Promise<void>;
  subscribe(listener: (event: RunnerEvent) => void): Unsubscribe;
}
