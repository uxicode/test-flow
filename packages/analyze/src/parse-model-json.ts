import type { InputFinding, ScreenAnalysis } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const MODEL_JSON_READ_ERROR = "모델 응답에서 JSON을 읽지 못했습니다.";

/**
 * 멀티라인 마크다운 코드 펜스를 제거한다.
 * qwen2.5vl:7b는 종종 ```json\n...\n``` 블록으로 감싸서 응답한다.
 */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```\s*$/u, "")
    .trim();
}

/**
 * JSON이 중간에 잘린 경우 복구를 시도한다.
 *
 * 처리하는 케이스:
 *  - 문자열 값이 중간에 잘림: `"options": ["전체", "10개`  → 닫는 " 추가
 *  - { 와 [ 구분하여 각각 } 와 ] 로 닫음
 *  - 쉼표 뒤 값이 없는 경우: trailing comma → null 삽입 후 닫기
 */
function tryRepairJson(fragment: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escaped = false;
  let i = 0;

  for (; i < fragment.length; i += 1) {
    const ch = fragment[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = fragment;

  // 문자열 안에서 잘린 경우: 열린 따옴표를 닫고 값을 완성한다
  if (inString) {
    repaired += "\"";
  }

  // trailing comma 또는 콜론 뒤 값 누락 처리: 마지막 유효 문자 확인
  const lastMeaningful = repaired.trimEnd();
  if (lastMeaningful.endsWith(",") || lastMeaningful.endsWith(":")) {
    repaired += "null";
  }

  // 스택에 남은 열린 괄호를 역순으로 닫는다
  for (let j = stack.length - 1; j >= 0; j -= 1) {
    repaired += stack[j] === "{" ? "}" : "]";
  }

  return repaired;
}

export function parseModelJson(raw: string, screenKey: string, fallbackName: string): ScreenAnalysis {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error(MODEL_JSON_READ_ERROR);

  let parsed: unknown;

  // 1차: 정상 파싱 시도 (마지막 '}'까지)
  const end = cleaned.lastIndexOf("}");
  if (end > start) {
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    } catch {
      // 계속해서 복구 시도
    }
  }

  // 2차: 잘린 JSON 복구 시도 (컨텍스트 초과로 응답이 중간에 끊긴 경우)
  if (!parsed) {
    try {
      const repaired = tryRepairJson(cleaned.slice(start));
      parsed = JSON.parse(repaired) as unknown;
    } catch {
      throw new Error(MODEL_JSON_READ_ERROR);
    }
  }
  const record = asRecord(parsed);
  if (!record) throw new Error(MODEL_JSON_READ_ERROR);
  const inputs: InputFinding[] = [];
  if (Array.isArray(record.inputs)) {
    for (const item of record.inputs) {
      const row = asRecord(item);
      if (!row) continue;
      const target = asText(row.target);
      if (!target) continue;
      const options = Array.isArray(row.options)
        ? row.options
            .map((item) => asText(item))
            .filter(Boolean)
        : undefined;
      inputs.push({
        target,
        constraint: asText(row.constraint),
        warning: asText(row.warning),
        failureExample: asText(row.failureExample),
        control: asText(row.control) || undefined,
        options: options?.length ? options : undefined,
      });
    }
  }
  const screenName = asText(record.screenName) || fallbackName;
  return {
    screenKey,
    screenName,
    inputs,
    successText: asText(record.successText),
    buttonName: asText(rowButton(record)),
  };
}

function rowButton(record: Record<string, unknown>): unknown {
  return record.buttonName;
}
