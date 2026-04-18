import type { Scenario, Step } from "../types";

export interface RunStartOptions {
  baseUrl?: string;
}

/** Polymorphic builders for POST /api/runs body by scenario mode. */
export interface IRunStartBodyBuilder {
  build(scenario: Scenario, opts: RunStartOptions): Record<string, unknown>;
}

export class BuilderStepsRunStartBody implements IRunStartBodyBuilder {
  build(scenario: Scenario, opts: RunStartOptions): Record<string, unknown> {
    return {
      scenarioId: scenario.id,
      steps: scenario.steps as Step[],
      excelTestCases: scenario.excelTestCases ?? [],
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    };
  }
}

export class ScriptRunStartBody implements IRunStartBodyBuilder {
  build(scenario: Scenario, opts: RunStartOptions): Record<string, unknown> {
    return {
      scenarioId: scenario.id,
      rawScript: scenario.rawScript,
      excelTestCases: scenario.excelTestCases ?? [],
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    };
  }
}

export function runStartBodyBuilderFor(
  mode: Scenario["mode"],
): IRunStartBodyBuilder {
  return mode === "builder"
    ? new BuilderStepsRunStartBody()
    : new ScriptRunStartBody();
}
