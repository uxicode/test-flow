import type { DataDirName } from "./data-paths.js";

export interface HealthResponse {
  ok: true;
  service: "testflow-api";
  dataRoot: string;
  dataDirs: Record<DataDirName, string>;
  runLimits: {
    stepTimeoutMs: number;
    maxKeptRuns: number;
  };
}
