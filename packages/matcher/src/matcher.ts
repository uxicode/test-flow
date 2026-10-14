import type { AnalysisWorker } from "@testflow/analyze";
import type { ScreenElementMap } from "@testflow/runner";
import { type ControlKind, type LocatorStrategy, type TestCase } from "@testflow/tc";
import { MAX_MODEL_CANDIDATES, modelPickStep } from "./model-match.js";
import {
  MATCH_VERSION,
  type MatchCandidate,
  type MatchSet,
  type MatchStatus,
  type TcStepMatch,
} from "./match-result.js";
import { ruleMatchStep } from "./rule-match.js";

/** 자동 승인 임계값. 이 이상이면 human 검토 없이 "matched" 처리. */
export const EXACT_THRESHOLD = 0.8;
/** 모델 보조 임계값. 규칙 최고 신뢰도가 이 이상일 때 모델에 맡긴다. */
export const MODEL_THRESHOLD = 0.5;

/** TC 입력에서 컨트롤 종류를 읽는다. */
function tcInputKind(input: { control?: ControlKind }): ControlKind | undefined {
  return input.control;
}

/** 컨트롤이 버튼 유형(입력 필드가 아님)이면 매칭 대상에서 제외한다. */
function isInputLikeControl(kind?: ControlKind): boolean {
  if (!kind) return true;
  const BUTTON_KINDS: ControlKind[] = [];
  return !BUTTON_KINDS.includes(kind);
}

/**
 * TC 케이스 목록과 요소 맵을 매칭하여 MatchSet 을 생성한다.
 *
 * @param cases     - 매칭할 TC 케이스 목록
 * @param map       - 화면 요소 맵
 * @param mapId     - 요소 맵 파일 ID (MatchCandidate 에 기록)
 * @param jobId     - 분석 작업 ID
 * @param worker    - Ollama 워커 (모델 보조에 사용; 없으면 rule only)
 * @param signal    - 중단 신호
 */
export async function matchTcToMap(options: {
  cases: TestCase[];
  map: ScreenElementMap;
  mapId: string;
  jobId: string;
  worker?: AnalysisWorker;
  signal?: AbortSignal;
  onLog?: (msg: string) => void;
}): Promise<MatchSet> {
  const { cases, map, mapId, jobId, worker, signal } = options;
  const log = options.onLog ?? (() => undefined);

  const steps: TcStepMatch[] = [];
  const seen = new Set<string>(); // tcId:target 중복 방지

  for (const tc of cases) {
    for (const input of tc.inputs) {
      if (signal?.aborted) throw new Error("사용자가 중지했습니다.");

      const key = `${tc.id}:${input.target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!isInputLikeControl(input.control)) continue;

      const stepKind = tcInputKind(input);

      log(`매칭 중: "${input.target}" (TC: ${tc.title})`);

      // 1단계: 규칙 기반 매칭
      const ruleHits = ruleMatchStep(input.target, stepKind, map.elements, mapId, input.options ?? []);

      const candidates: MatchCandidate[] = ruleHits.map((hit) => ({
        elementMapId: mapId,
        elementIndex: hit.elementIndex,
        elementLabel: hit.elementLabel,
        controlKind: hit.controlKind,
        bestLocator: hit.bestLocator,
        confidence: hit.confidence,
        method: hit.method,
        reason: hit.reason,
      }));

      let chosenIndex = candidates.length > 0 ? 0 : -1;
      let status: MatchStatus = "review";

      const topConfidence = candidates[0]?.confidence ?? 0;

      if (topConfidence >= EXACT_THRESHOLD && !isAmbiguous(candidates)) {
        // 충분히 높은 신뢰도 + 명확한 1등 → 자동 승인
        status = "matched";
        log(`  → 자동 매칭 (신뢰도 ${(topConfidence * 100).toFixed(0)}%): ${candidates[0]?.elementLabel}`);
      } else if (topConfidence >= MODEL_THRESHOLD && worker && !signal?.aborted) {
        // 모델 보조
        const topElements = ruleHits
          .slice(0, MAX_MODEL_CANDIDATES)
          .map((h) => map.elements[h.elementIndex]!)
          .filter(Boolean);

        const pick = await modelPickStep(input.target, stepKind, topElements, worker, signal ?? new AbortController().signal);

        if (pick) {
          chosenIndex = pick.chosenIndex;
          // 기존 candidates 에 모델 결정 반영
          if (candidates[chosenIndex]) {
            candidates[chosenIndex] = {
              ...candidates[chosenIndex],
              confidence: 0.75,
              method: "model",
              reason: pick.reason || "모델 선택",
            };
          }
          status = "review"; // 모델 선택도 검토 필요 (확인 후 승인)
          log(`  → 모델 선택: ${candidates[chosenIndex]?.elementLabel} (검토 필요)`);
        } else {
          log(`  → 모델 응답 무효 — 검토 필요`);
        }
      } else if (candidates.length === 0) {
        log(`  → 후보 없음 — 검토 필요`);
      } else {
        log(`  → 신뢰도 낮음 (${(topConfidence * 100).toFixed(0)}%) — 검토 필요`);
      }

      steps.push({
        tcId: tc.id,
        stepLabel: input.target,
        controlKind: input.control,
        candidates,
        chosenIndex,
        status,
        initialChosenIndex: chosenIndex,
        initialStatus: status,
      });
    }
  }

  return {
    $version: MATCH_VERSION,
    jobId,
    mapId,
    createdAt: new Date().toISOString(),
    steps,
  };
}

/** 상위 두 후보의 신뢰도 차이가 작아서 애매한지 확인한다. */
function isAmbiguous(candidates: MatchCandidate[]): boolean {
  if (candidates.length < 2) return false;
  const gap = (candidates[0]?.confidence ?? 0) - (candidates[1]?.confidence ?? 0);
  return gap < 0.1;
}

export type ResolvedLocator = {
  selector: string;
  selectorStrategy: LocatorStrategy;
};

/**
 * 실행 시 매칭 결과에서 스텝 레이블에 해당하는 승인된 로케이터를 찾는다.
 * selector + selectorStrategy 쌍으로 반환해 Playwright 메서드를 올바르게 선택한다.
 */
export function resolveApprovedLocator(set: MatchSet, stepLabel: string): ResolvedLocator | undefined {
  const step = set.steps.find((s) => s.stepLabel === stepLabel);
  if (!step) return undefined;
  if (step.status !== "matched" && step.status !== "approved") return undefined;
  if (step.chosenIndex < 0) return undefined;

  const candidate = step.candidates[step.chosenIndex];
  if (!candidate) return undefined;

  const loc = candidate.bestLocator;
  switch (loc.strategy) {
    case "testid":
    case "css":
      return { selector: loc.value, selectorStrategy: loc.strategy };
    case "label":
    case "placeholder":
    case "nearby-text":
      return { selector: loc.value, selectorStrategy: loc.strategy };
    case "role+name":
      return { selector: loc.value, selectorStrategy: "role+name" };
    default: {
      const _exhaustive: never = loc.strategy;
      void _exhaustive;
      return undefined;
    }
  }
}

/** @deprecated 단순 CSS 셀렉터만 반환하는 이전 방식. resolveApprovedLocator 를 사용하세요. */
export function resolveApprovedSelector(set: MatchSet, stepLabel: string): string | undefined {
  return resolveApprovedLocator(set, stepLabel)?.selector;
}


/**
 * 사람의 검토 결정을 모두 지우고 자동 매칭 직후 상태로 되돌린다.
 * 초기값이 없는 이전 파일은 후보 목록에서 자동 매칭 규칙을 다시 적용해 복원한다.
 */
export function resetMatchReview(set: MatchSet): void {
  for (const step of set.steps) {
    const fallback = initialDecision(step.candidates);
    const chosenIndex = step.initialChosenIndex ?? fallback.chosenIndex;
    step.chosenIndex = chosenIndex >= 0 && chosenIndex < step.candidates.length ? chosenIndex : -1;
    step.status = step.initialStatus ?? fallback.status;
    delete step.reviewNote;
  }
}

function initialDecision(candidates: MatchCandidate[]): { chosenIndex: number; status: MatchStatus } {
  if (candidates.length === 0) return { chosenIndex: -1, status: "review" };
  const top = candidates[0]?.confidence ?? 0;
  if (top >= EXACT_THRESHOLD && !isAmbiguous(candidates)) return { chosenIndex: 0, status: "matched" };
  const byModel = candidates.findIndex((candidate) => candidate.method === "model");
  return { chosenIndex: byModel >= 0 ? byModel : 0, status: "review" };
}
