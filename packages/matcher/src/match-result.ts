import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ControlKind } from "@testflow/tc";
import type { LocatorCandidate } from "@testflow/runner";

export const MATCH_VERSION = 1;

export type MatchStatus = "matched" | "review" | "rejected" | "approved";
export type MatchMethod = "exact" | "rule" | "model" | "human";

/** 하나의 TC 입력 레이블에 대한 요소 맵 후보 */
export interface MatchCandidate {
  /** 요소 맵 파일 ID */
  elementMapId: string;
  /** 요소 맵의 인덱스 */
  elementIndex: number;
  /** 요소의 레이블 */
  elementLabel: string;
  /** 요소의 컨트롤 종류 */
  controlKind: ControlKind;
  /** 실행에 사용할 최우선 로케이터 */
  bestLocator: LocatorCandidate;
  confidence: number;
  method: MatchMethod;
  reason: string;
}

/** TC 입력 한 항목에 대한 매칭 결과 */
export interface TcStepMatch {
  tcId: string;
  /** TC input.target (TC 레이블) */
  stepLabel: string;
  controlKind?: ControlKind;
  candidates: MatchCandidate[];
  /** candidates[] 인덱스, -1이면 "거부" */
  chosenIndex: number;
  status: MatchStatus;
  reviewNote?: string;
  /** 자동 매칭 직후의 선택. 검토 리셋 때 되돌린다. (이전 버전 파일에는 없다) */
  initialChosenIndex?: number;
  /** 자동 매칭 직후의 상태 */
  initialStatus?: MatchStatus;
}

/** 한 번의 매칭 세션 결과 */
export interface MatchSet {
  $version: number;
  /** 분석 작업 ID */
  jobId: string;
  /** 사용된 요소 맵 ID */
  mapId: string;
  createdAt: string;
  steps: TcStepMatch[];
}

export interface MatchSetMeta {
  matchId: string;
  jobId: string;
  mapId: string;
  createdAt: string;
  totalSteps: number;
  reviewCount: number;
  matchedCount: number;
}

// ---------------------------------------------------------------------------
// 파일 경로 유틸
// ---------------------------------------------------------------------------

function resolveDir(): string {
  const fromEnv = process.env.MATCH_RESULT_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "../../data/matches");
}

function filePath(dir: string, matchId: string): string {
  return path.join(dir, `${matchId}.json`);
}

function computeMeta(matchId: string, set: MatchSet): MatchSetMeta {
  return {
    matchId,
    jobId: set.jobId,
    mapId: set.mapId,
    createdAt: set.createdAt,
    totalSteps: set.steps.length,
    reviewCount: set.steps.filter((s) => s.status === "review").length,
    matchedCount: set.steps.filter((s) => s.status === "matched" || s.status === "approved").length,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function saveMatchSet(set: MatchSet): MatchSetMeta {
  const dir = resolveDir();
  fs.mkdirSync(dir, { recursive: true });

  const matchId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  fs.writeFileSync(filePath(dir, matchId), JSON.stringify(set, null, 2), "utf8");
  return computeMeta(matchId, set);
}

export function loadMatchSet(matchId: string): MatchSet {
  const dir = resolveDir();
  const fp = filePath(dir, matchId);
  if (!fs.existsSync(fp)) throw new Error(`매칭 결과를 찾지 못했습니다: ${matchId}`);
  const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as MatchSet;
  if (parsed.$version !== MATCH_VERSION)
    throw new Error(`지원하지 않는 매칭 결과 버전입니다: ${parsed.$version}`);
  return parsed;
}

export function saveMatchSetById(matchId: string, set: MatchSet): void {
  const dir = resolveDir();
  const fp = filePath(dir, matchId);
  fs.writeFileSync(fp, JSON.stringify(set, null, 2), "utf8");
}

export function listMatchSets(): MatchSetMeta[] {
  const dir = resolveDir();
  if (!fs.existsSync(dir)) return [];

  const metas: MatchSetMeta[] = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().reverse()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as MatchSet;
      metas.push(computeMeta(name.replace(/\.json$/u, ""), parsed));
    } catch {
      // 손상된 파일 무시
    }
  }
  return metas;
}

export function deleteMatchSet(matchId: string): void {
  const dir = resolveDir();
  const fp = filePath(dir, matchId);
  if (!fs.existsSync(fp)) throw new Error(`매칭 결과를 찾지 못했습니다: ${matchId}`);
  fs.unlinkSync(fp);
}

/** jobId + mapId 기준으로 가장 최근 매칭 결과를 찾는다. */
export function findLatestMatchSet(jobId: string, mapId: string): { matchId: string; set: MatchSet } | undefined {
  const dir = resolveDir();
  if (!fs.existsSync(dir)) return undefined;

  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().reverse()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as MatchSet;
      if (parsed.jobId === jobId && parsed.mapId === mapId) {
        return { matchId: name.replace(/\.json$/u, ""), set: parsed };
      }
    } catch {
      // 무시
    }
  }
  return undefined;
}

/**
 * 사람의 검토 결정을 매칭 결과에 적용한다.
 * action: "approve" (현재 chosenIndex 확정) | "choose" (다른 후보 선택) | "reject" (이 단계 거부)
 */
export function applyReview(
  set: MatchSet,
  stepIndex: number,
  action: "approve" | "choose" | "reject",
  chosenIndex?: number,
  note?: string,
): void {
  const step = set.steps[stepIndex];
  if (!step) throw new Error(`스텝 인덱스가 올바르지 않습니다: ${stepIndex}`);

  if (action === "reject") {
    step.status = "rejected";
    step.chosenIndex = -1;
  } else if (action === "approve") {
    step.status = "approved";
  } else {
    if (chosenIndex === undefined || chosenIndex < 0 || chosenIndex >= step.candidates.length) {
      throw new Error(`유효하지 않은 후보 인덱스: ${chosenIndex}`);
    }
    step.chosenIndex = chosenIndex;
    step.status = "approved";
  }

  if (note) step.reviewNote = note;
}
