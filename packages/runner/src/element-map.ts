import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ControlKind } from "@testflow/tc";

export const ELEMENT_MAP_VERSION = 1;

/** 로케이터 전략 우선 순위 (높은 쪽이 앞에 온다) */
export type LocatorStrategy = "testid" | "role+name" | "label" | "nearby-text" | "placeholder" | "css";

/**
 * 하나의 로케이터 후보.
 *
 * - testid  : `[data-testid="…"]` 형식의 CSS 셀렉터
 * - role+name: `{role}|{accessible-name}` — Phase 3 에서 getByRole(role, { name }) 로 변환
 * - label   : 연결된 label 텍스트 — getByLabel() 로 변환
 * - placeholder: placeholder 텍스트 — getByPlaceholder() 로 변환
 * - css     : 계산된 CSS 셀렉터 (폴백)
 */
export interface LocatorCandidate {
  strategy: LocatorStrategy;
  value: string;
}

export interface ElementEntry {
  /** 접근 가능한 이름(레이블) */
  label: string;
  controlKind: ControlKind;
  /** 우선순위 순서로 정렬된 로케이터 후보 */
  locators: LocatorCandidate[];
  /**
   * 드롭다운 옵션이 나타나는 위치.
   * - inline : 트리거 부모 안에 렌더링
   * - portal : document.body 아래에 별도 레이어
   * - listbox: 네이티브 <select> OS 목록
   * - null   : 해당 없음 또는 감지 불가
   */
  dropdownOptionContainer: "inline" | "portal" | "listbox" | null;
  /** 셀렉터 피커로 직접 고른 CSS 셀렉터 (가장 높은 우선순위로 사용) */
  pinnedSelector?: string;
}

/** 한 화면(URL)의 요소 맵 */
export interface ScreenElementMap {
  $version: number;
  /** 탐색한 URL (원본) */
  url: string;
  /** 비교·조회에 쓰는 정규화된 URL (프래그먼트·trailing-slash 제거) */
  normalizedUrl: string;
  exploredAt: string;
  /** 페이지 `<title>` */
  screenTitle: string;
  elements: ElementEntry[];
  /** 조회 버튼 클릭 시 관찰된 API URL 목록 (베스트 에퍼트) */
  queryApiUrls: string[];
}

export interface ElementMapMeta {
  mapId: string;
  url: string;
  exploredAt: string;
  screenTitle: string;
  elementCount: number;
}

// ---------------------------------------------------------------------------
// 파일 경로 유틸
// ---------------------------------------------------------------------------

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let p = u.pathname.replace(/\/+$/u, "") || "/";
    u.pathname = p;
    return u.toString();
  } catch {
    return url;
  }
}

function resolveDir(): string {
  const fromEnv = process.env.ELEMENT_MAP_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "../../data/element-maps");
}

function filePath(dir: string, mapId: string): string {
  return path.join(dir, `${mapId}.json`);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function saveElementMap(map: ScreenElementMap): ElementMapMeta {
  const dir = resolveDir();
  fs.mkdirSync(dir, { recursive: true });

  const mapId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  fs.writeFileSync(filePath(dir, mapId), JSON.stringify(map, null, 2), "utf8");

  return {
    mapId,
    url: map.url,
    exploredAt: map.exploredAt,
    screenTitle: map.screenTitle,
    elementCount: map.elements.length,
  };
}

export function loadElementMap(mapId: string): ScreenElementMap {
  const dir = resolveDir();
  const fp = filePath(dir, mapId);
  if (!fs.existsSync(fp)) throw new Error(`요소 맵을 찾지 못했습니다: ${mapId}`);
  const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as ScreenElementMap;
  if (parsed.$version !== ELEMENT_MAP_VERSION)
    throw new Error(`지원하지 않는 요소 맵 버전입니다: ${parsed.$version}`);
  return parsed;
}

export function listElementMaps(): ElementMapMeta[] {
  const dir = resolveDir();
  if (!fs.existsSync(dir)) return [];

  const metas: ElementMapMeta[] = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().reverse()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as ScreenElementMap;
      metas.push({
        mapId: name.replace(/\.json$/u, ""),
        url: parsed.url,
        exploredAt: parsed.exploredAt,
        screenTitle: parsed.screenTitle,
        elementCount: parsed.elements.length,
      });
    } catch {
      // 손상된 파일은 목록에서 제외
    }
  }
  return metas;
}

export function deleteElementMap(mapId: string): void {
  const dir = resolveDir();
  const fp = filePath(dir, mapId);
  if (!fs.existsSync(fp)) throw new Error(`요소 맵을 찾지 못했습니다: ${mapId}`);
  fs.unlinkSync(fp);
}

/**
 * URL 기준으로 가장 최근 요소 맵을 찾는다.
 * 없으면 `undefined` 반환.
 */
export function findLatestMapByUrl(url: string): { mapId: string; map: ScreenElementMap } | undefined {
  const normalized = normalizeUrl(url);
  const dir = resolveDir();
  if (!fs.existsSync(dir)) return undefined;

  const candidates = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .reverse();

  for (const name of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as ScreenElementMap;
      if (parsed.normalizedUrl === normalized) {
        return { mapId: name.replace(/\.json$/u, ""), map: parsed };
      }
    } catch {
      // 무시
    }
  }
  return undefined;
}

/**
 * URL에 대응하는 요소 맵에 특정 레이블의 `pinnedSelector` 를 기록한다.
 * 맵이 없으면 최소 맵을 새로 생성한다.
 */
export function upsertPinnedSelector(url: string, label: string, selector: string): void {
  const found = findLatestMapByUrl(url);

  if (found) {
    const { mapId, map } = found;
    const existing = map.elements.find((e) => e.label === label);
    if (existing) {
      existing.pinnedSelector = selector;
    } else {
      // 요소 목록에 없으면 최소 항목 추가
      map.elements.push({
        label,
        controlKind: "text",
        locators: [{ strategy: "css", value: selector }],
        dropdownOptionContainer: null,
        pinnedSelector: selector,
      });
    }
    const dir = resolveDir();
    fs.writeFileSync(filePath(dir, mapId), JSON.stringify(map, null, 2), "utf8");
  } else {
    // 맵이 없으면 최소 맵 생성
    const map: ScreenElementMap = {
      $version: ELEMENT_MAP_VERSION,
      url,
      normalizedUrl: normalizeUrl(url),
      exploredAt: new Date().toISOString(),
      screenTitle: "",
      elements: [
        {
          label,
          controlKind: "text",
          locators: [{ strategy: "css", value: selector }],
          dropdownOptionContainer: null,
          pinnedSelector: selector,
        },
      ],
      queryApiUrls: [],
    };
    saveElementMap(map);
  }
}
