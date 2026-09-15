export const PIPELINE_STAGE = {
  ingest: "ingest",
  mermaid: "mermaid",
  testCase: "test-case",
  run: "run",
} as const;

export type PipelineStage =
  (typeof PIPELINE_STAGE)[keyof typeof PIPELINE_STAGE];

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  PIPELINE_STAGE.ingest,
  PIPELINE_STAGE.mermaid,
  PIPELINE_STAGE.testCase,
  PIPELINE_STAGE.run,
];
