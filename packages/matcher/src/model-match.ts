import type { AnalysisWorker } from "@testflow/analyze";
import type { ControlKind } from "@testflow/tc";
import type { ElementEntry } from "@testflow/runner";

/** 최대 모델에 넘기는 후보 수 */
export const MAX_MODEL_CANDIDATES = 5;

/** 모델 선택 결과 */
export interface ModelPickResult {
  /** 후보 배열의 인덱스 (0부터) */
  chosenIndex: number;
  reason: string;
}

function buildPickPrompt(stepLabel: string, stepKind: ControlKind | undefined, candidates: ElementEntry[]): string {
  const kindHint = stepKind ? ` (컨트롤 종류: ${stepKind})` : "";
  const candidateLines = candidates
    .map((el, i) => `${i}. "${el.label}" (${el.controlKind})`)
    .join("\n");

  return [
    "TC 입력 항목 레이블과 가장 잘 일치하는 화면 요소를 후보 목록에서 하나만 선택하세요.",
    "셀렉터나 코드는 절대로 생성하지 마세요. 번호만 선택하면 됩니다.",
    "",
    `TC 레이블: "${stepLabel}"${kindHint}`,
    "",
    "후보:",
    candidateLines,
    "",
    `반드시 아래 JSON 형식으로만 응답하세요. 유효한 번호: ${candidates.map((_, i) => i).join(", ")}`,
    '{"choice": <번호>, "reason": "<선택 이유 한 줄>"}',
  ].join("\n");
}

function parseModelResponse(raw: string, maxIndex: number): ModelPickResult | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```\s*$/u, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const choice = obj.choice;
  if (typeof choice !== "number" || !Number.isInteger(choice)) return null;
  if (choice < 0 || choice > maxIndex) return null;

  const reason = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 200) : "";
  return { chosenIndex: choice, reason };
}

/**
 * 규칙 매칭이 애매할 때 로컬 모델에 후보 선택을 맡긴다.
 *
 * 안전장치:
 * - 후보 번호 범위를 벗어나는 응답은 null 반환
 * - 유효한 JSON 이 아니면 null 반환
 * - null 이면 호출부에서 "review" 로 처리한다
 * - 모델은 절대로 셀렉터/코드를 생성할 수 없다 (프롬프트에 명시)
 */
export async function modelPickStep(
  stepLabel: string,
  stepKind: ControlKind | undefined,
  topCandidates: ElementEntry[],
  worker: AnalysisWorker,
  signal: AbortSignal,
): Promise<ModelPickResult | null> {
  const candidates = topCandidates.slice(0, MAX_MODEL_CANDIDATES);
  if (candidates.length === 0) return null;

  const prompt = buildPickPrompt(stepLabel, stepKind, candidates);

  try {
    const raw = await worker.ask({ text: prompt, signal });
    const result = parseModelResponse(raw, candidates.length - 1);
    if (result) return result;

    // 1회 재시도 (더 엄격한 힌트 추가)
    const retryPrompt = `${prompt}\n\n주의: 반드시 숫자(${candidates.map((_, i) => i).join("/")} 중 하나)만 choice에 넣으세요.`;
    const raw2 = await worker.ask({ text: retryPrompt, signal });
    return parseModelResponse(raw2, candidates.length - 1);
  } catch {
    return null;
  }
}

/** 테스트용 — 모델 응답 파싱 로직만 검증 */
export function _parseModelResponseForTest(raw: string, maxIndex: number): ModelPickResult | null {
  return parseModelResponse(raw, maxIndex);
}
