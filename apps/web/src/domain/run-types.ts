import type { SmartTC } from "../types";

export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "idle";

export interface RunSummary {
  id: string;
  status: RunStatus;
  exitCode: number | null;
  errorMessage?: string;
  artifacts?: {
    reportIndex: string;
    testResultsDir: string;
    screenshotUrls?: string[];
    videoUrls?: string[];
  };
}

export interface RecordingStopBody {
  script?: string;
  steps?: Record<string, unknown>[];
  smartTc?: SmartTC[];
  parseWarnings?: string[];
  sessionKind?: "codegen" | "hosted";
  sessionArtifacts?: { videoUrl: string };
  error?: string;
}

/** Per-scenario run & record panel state kept when switching scenarios. */
export interface ScenarioRunUiState {
  recordUrl: string;
  lastRecording: {
    sessionKind: "codegen" | "hosted";
    artifacts: { videoUrl: string };
  } | null;
  smartTc: SmartTC[] | null;
  runId: string | null;
  status: RunStatus;
  log: string;
  summary: RunSummary | null;
  isStarting: boolean;
}
