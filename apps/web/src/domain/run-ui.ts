import type { ScenarioRunUiState } from "./run-types";

export function createDefaultRunUi(): ScenarioRunUiState {
  return {
    recordUrl: "https://example.com",
    lastRecording: null,
    smartTc: null,
    runId: null,
    status: "idle",
    log: "",
    summary: null,
    isStarting: false,
  };
}
