import type { InputFinding, ScreenAnalysis } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseModelJson(raw: string, screenKey: string, fallbackName: string): ScreenAnalysis {
  const trimmed = raw.trim().replace(/^```(?:json)?/u, "").replace(/```$/u, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("모델 응답에서 JSON을 읽지 못했습니다.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    throw new Error("모델 응답에서 JSON을 읽지 못했습니다.");
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("모델 응답에서 JSON을 읽지 못했습니다.");
  const inputs: InputFinding[] = [];
  if (Array.isArray(record.inputs)) {
    for (const item of record.inputs) {
      const row = asRecord(item);
      if (!row) continue;
      const target = asText(row.target);
      if (!target) continue;
      inputs.push({
        target,
        constraint: asText(row.constraint),
        warning: asText(row.warning),
        failureExample: asText(row.failureExample),
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
