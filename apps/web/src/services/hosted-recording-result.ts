import type { Scenario, SmartTC, Step } from "../types";
import { ScenarioApi } from "./scenario-api";

export async function persistRecordingToScenario(args: {
  api: ScenarioApi;
  targetSid: string;
  draft: Scenario;
  normalizedSteps: Step[];
  script: string;
  smartTcPersist: SmartTC[];
}): Promise<Scenario> {
  const { api, targetSid, draft, normalizedSteps, script, smartTcPersist } =
    args;
  try {
    const updated = await api.update(targetSid, {
      name: draft.name,
      mode: "builder",
      steps: normalizedSteps,
      rawScript: script,
      excelTestCases: draft.excelTestCases ?? [],
      smartTc: smartTcPersist,
    });
    return {
      ...updated,
      excelTestCases: updated.excelTestCases ?? [],
      smartTc: updated.smartTc ?? smartTcPersist,
    };
  } catch {
    return {
      ...draft,
      rawScript: script,
      mode: "builder",
      steps: normalizedSteps,
      excelTestCases: draft.excelTestCases ?? [],
      smartTc: smartTcPersist,
    };
  }
}
