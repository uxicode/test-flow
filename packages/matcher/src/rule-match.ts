import type { ControlKind } from "@testflow/tc";
import type { ElementEntry, LocatorCandidate } from "@testflow/runner";
import { controlKindsCompatible, isSynonym, normalizeLabel } from "./normalize.js";

export interface RuleMatchHit {
  elementIndex: number;
  elementLabel: string;
  controlKind: ControlKind;
  bestLocator: LocatorCandidate;
  confidence: number;
  method: "exact" | "rule";
  reason: string;
}

/** LocatorCandidate 목록에서 실행 시 가장 신뢰할 수 있는 후보를 고른다. */
function pickBestLocator(locators: LocatorCandidate[], pinnedSelector?: string): LocatorCandidate {
  if (pinnedSelector) return { strategy: "css", value: pinnedSelector };

  const PRIORITY: LocatorCandidate["strategy"][] = ["testid", "role+name", "label", "nearby-text", "placeholder", "css"];
  for (const strategy of PRIORITY) {
    const found = locators.find((l) => l.strategy === strategy);
    if (found) return found;
  }
  return locators[0] ?? { strategy: "css", value: "" };
}

/**
 * TC 입력 레이블 하나를 요소 목록과 규칙 기반으로 매칭한다.
 * 결과는 confidence 내림차순으로 정렬된다.
 */
export function ruleMatchStep(
  stepLabel: string,
  stepKind: ControlKind | undefined,
  elements: ElementEntry[],
  _elementMapId: string,
): RuleMatchHit[] {
  const normStep = normalizeLabel(stepLabel);
  const results: RuleMatchHit[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const normEl = normalizeLabel(el.label);

    let confidence = 0;
    let method: "exact" | "rule" = "rule";
    let reason = "";

    if (normStep === normEl) {
      confidence = 1.0;
      method = "exact";
      reason = "레이블 완전 일치";
    } else if (isSynonym(normStep, normEl)) {
      confidence = 0.85;
      reason = `동의어 일치 ("${normStep}" ↔ "${normEl}")`;
    } else if (normEl.includes(normStep) && normStep.length >= 2) {
      confidence = 0.7;
      reason = `부분 포함 ("${normEl}" ⊇ "${normStep}")`;
    } else if (normStep.includes(normEl) && normEl.length >= 2) {
      confidence = 0.65;
      reason = `역방향 포함 ("${normStep}" ⊇ "${normEl}")`;
    } else {
      continue;
    }

    // 컨트롤 타입 조정
    if (stepKind && el.controlKind) {
      if (stepKind === el.controlKind) {
        confidence = Math.min(1.0, confidence + 0.05);
        reason += " + 컨트롤 일치";
      } else if (!controlKindsCompatible(stepKind, el.controlKind)) {
        confidence *= 0.7;
        reason += ` (컨트롤 불일치: TC=${stepKind}, 맵=${el.controlKind})`;
      }
    }

    results.push({
      elementIndex: i,
      elementLabel: el.label,
      controlKind: el.controlKind,
      bestLocator: pickBestLocator(el.locators, el.pinnedSelector),
      confidence,
      method,
      reason,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export { pickBestLocator };
