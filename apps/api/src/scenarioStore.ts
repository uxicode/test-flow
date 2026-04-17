import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DocTcGenerationMeta,
  GeneratedDocTestCase,
  RequirementItem,
  SourceDocumentRef,
} from "./docTcTypes.js";
import type { ExcelTestCase } from "./excelTestCaseTypes.js";
import type { SmartTC } from "./tcGenerator.js";

export type StepType =
  | "goto"
  | "click"
  | "fill"
  | "check"
  | "assert_visible"
  | "assert_hidden"
  | "assert_text"
  | "wait_ms"
  | "wait_for_selector"
  | "screenshot";

export type SelectorStrategy =
  | "text"
  | "role"
  | "label"
  | "placeholder"
  | "css"
  | "testid";

export interface Step {
  id: string;
  type: StepType;
  selectorStrategy?: SelectorStrategy;
  selectorValue?: string;
  role?: string;
  inputValue?: string;
  waitMs?: number;
  label?: string;
}

export type ScenarioMode = "builder" | "script" | "docTc";

export interface Scenario {
  id: string;
  name: string;
  mode: ScenarioMode;
  steps: Step[];
  rawScript: string;
  /** Internal spreadsheet-like testcase shape used for merged spec generation. */
  excelTestCases?: ExcelTestCase[];
  /** 녹화 스마트 TC 또는 /api/tc/convert 결과. 빌더 스텝과 함께 유지. */
  smartTc?: SmartTC[];
  /** 업로드한 원본 기획 문서 메타데이터 */
  sourceDocument?: SourceDocumentRef;
  /** 추출된 문서 원문 텍스트 (OCR/파서 결과) */
  documentText?: string;
  /** 문서에서 추출한 구조화 requirement */
  requirementsExtract?: RequirementItem[];
  /** requirement 기반으로 생성한 초안 TC */
  generatedDocTestCases?: GeneratedDocTestCase[];
  /** 생성기 메타데이터 */
  docTcGeneration?: DocTcGenerationMeta;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  mode: ScenarioMode;
  updatedAt: string;
}

function scenarioPath(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

export async function ensureScenariosDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function listScenarios(dir: string): Promise<ScenarioSummary[]> {
  await ensureScenariosDir(dir);
  const names = await fs.readdir(dir);
  const summaries: ScenarioSummary[] = [];
  for (const file of names) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const s = JSON.parse(raw) as Scenario;
      summaries.push({
        id: s.id,
        name: s.name,
        mode: s.mode,
        updatedAt: s.updatedAt,
      });
    } catch {
      /* skip corrupt */
    }
  }
  summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return summaries;
}

export async function getScenario(dir: string, id: string): Promise<Scenario | null> {
  try {
    const raw = await fs.readFile(scenarioPath(dir, id), "utf8");
    return JSON.parse(raw) as Scenario;
  } catch {
    return null;
  }
}

export async function createScenario(
  dir: string,
  partial: {
    name: string;
    mode?: ScenarioMode;
    steps?: Step[];
    rawScript?: string;
    excelTestCases?: ExcelTestCase[];
    smartTc?: SmartTC[];
    sourceDocument?: SourceDocumentRef;
    documentText?: string;
    requirementsExtract?: RequirementItem[];
    generatedDocTestCases?: GeneratedDocTestCase[];
    docTcGeneration?: DocTcGenerationMeta;
  },
): Promise<Scenario> {
  await ensureScenariosDir(dir);
  const now = new Date().toISOString();
  const id = randomUUID();
  const scenario: Scenario = {
    id,
    name: partial.name.trim() || "Untitled",
    mode: partial.mode ?? "builder",
    steps: Array.isArray(partial.steps) ? partial.steps : [],
    rawScript: typeof partial.rawScript === "string" ? partial.rawScript : "",
    excelTestCases: Array.isArray(partial.excelTestCases)
      ? partial.excelTestCases
      : [],
    ...(Array.isArray(partial.smartTc) && partial.smartTc.length > 0
      ? { smartTc: partial.smartTc }
      : {}),
    ...(partial.sourceDocument ? { sourceDocument: partial.sourceDocument } : {}),
    ...(typeof partial.documentText === "string"
      ? { documentText: partial.documentText }
      : {}),
    ...(Array.isArray(partial.requirementsExtract)
      ? { requirementsExtract: partial.requirementsExtract }
      : {}),
    ...(Array.isArray(partial.generatedDocTestCases)
      ? { generatedDocTestCases: partial.generatedDocTestCases }
      : {}),
    ...(partial.docTcGeneration ? { docTcGeneration: partial.docTcGeneration } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(scenarioPath(dir, id), JSON.stringify(scenario, null, 2), "utf8");
  return scenario;
}

export async function updateScenario(
  dir: string,
  id: string,
  patch: Partial<
    Pick<
      Scenario,
      | "name"
      | "mode"
      | "steps"
      | "rawScript"
      | "excelTestCases"
      | "smartTc"
      | "sourceDocument"
      | "documentText"
      | "requirementsExtract"
      | "generatedDocTestCases"
      | "docTcGeneration"
    >
  >,
): Promise<Scenario | null> {
  const existing = await getScenario(dir, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: Scenario = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim() || existing.name } : {}),
    ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
    ...(patch.rawScript !== undefined ? { rawScript: patch.rawScript } : {}),
    ...(patch.excelTestCases !== undefined
      ? { excelTestCases: patch.excelTestCases }
      : {}),
    ...(patch.smartTc !== undefined ? { smartTc: patch.smartTc } : {}),
    ...(patch.sourceDocument !== undefined ? { sourceDocument: patch.sourceDocument } : {}),
    ...(patch.documentText !== undefined ? { documentText: patch.documentText } : {}),
    ...(patch.requirementsExtract !== undefined
      ? { requirementsExtract: patch.requirementsExtract }
      : {}),
    ...(patch.generatedDocTestCases !== undefined
      ? { generatedDocTestCases: patch.generatedDocTestCases }
      : {}),
    ...(patch.docTcGeneration !== undefined
      ? { docTcGeneration: patch.docTcGeneration }
      : {}),
    updatedAt: now,
  };
  await fs.writeFile(scenarioPath(dir, id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function deleteScenario(dir: string, id: string): Promise<boolean> {
  try {
    await fs.unlink(scenarioPath(dir, id));
    return true;
  } catch {
    return false;
  }
}
