export const JOB_STATUS = {
  fetching: "fetching",
  planning: "planning",
  running: "running",
  reducing: "reducing",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const QUESTION_STATUS = {
  pending: "pending",
  running: "running",
  succeeded: "succeeded",
  timedOut: "timed_out",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS];

export interface InputFinding {
  target: string;
  constraint: string;
  warning: string;
  failureExample: string;
  /** text, select, radio, checkbox, date, date_range, combobox */
  control?: string;
  options?: string[];
}

export interface ScreenFeature {
  title: string;
  body: string;
}

export interface ScreenAnalysis {
  screenKey: string;
  screenName: string;
  inputs: InputFinding[];
  successText: string;
  buttonName: string;
  features?: ScreenFeature[];
}

export interface QuestionRecord {
  id: string;
  screenKey: string;
  screenName: string;
  status: QuestionStatus;
  message: string;
}

export interface AnalysisResult {
  status: JobStatus;
  screens: ScreenAnalysis[];
  questions: QuestionRecord[];
}

export interface AnalysisEvent {
  jobId: string;
  message: string;
  at: string;
  status?: JobStatus;
  result?: AnalysisResult;
}

export interface PlannedQuestion {
  id: string;
  screenKey: string;
  screenName: string;
  text: string;
}

export interface AnalysisWorker {
  ask(input: { text: string; images?: string[]; signal: AbortSignal }): Promise<string>;
  unload(): Promise<void>;
}
