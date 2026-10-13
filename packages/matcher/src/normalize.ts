import { CONTROL_KIND, type ControlKind } from "@testflow/tc";
import { LABEL_SYNONYMS } from "./synonyms.js";

/** 레이블을 정규화한다 (소문자, 공백 정리, 접미사 제거). */
export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[\u200b-\u200d\ufeff]/gu, "") // 제로-폭 문자 제거
    .replace(/[()\[\]{}]/gu, "") // 괄호 제거
    .replace(/(입력|필드|란|칸|선택|설정|드롭다운|필터|조건|항목|목록)\s*$/u, "")
    .trim();
}

/**
 * 두 정규화 레이블이 동의어인지 확인한다.
 * 방향성 없음: A→B 또는 B→A 모두 검사한다.
 */
export function isSynonym(a: string, b: string): boolean {
  if (a === b) return false; // 완전 일치는 exact 이고 synonym 이 아니다

  for (const [key, aliases] of Object.entries(LABEL_SYNONYMS)) {
    const group = [key, ...aliases];
    const hasA = group.includes(a);
    const hasB = group.includes(b);
    if (hasA && hasB) return true;
  }
  return false;
}

/**
 * 두 ControlKind 가 매칭 목적으로 호환 가능한지 판단한다.
 * 미지정(undefined)은 항상 호환으로 본다.
 */
export function controlKindsCompatible(a: ControlKind | undefined, b: ControlKind | undefined): boolean {
  if (!a || !b) return true;
  if (a === b) return true;

  const COMPATIBLE_PAIRS: [ControlKind, ControlKind][] = [
    [CONTROL_KIND.select, CONTROL_KIND.combobox],
    [CONTROL_KIND.combobox, CONTROL_KIND.select],
    [CONTROL_KIND.text, CONTROL_KIND.textarea],
    [CONTROL_KIND.textarea, CONTROL_KIND.text],
    [CONTROL_KIND.text, CONTROL_KIND.password],
    [CONTROL_KIND.password, CONTROL_KIND.text],
  ];
  return COMPATIBLE_PAIRS.some(([x, y]) => x === a && y === b);
}
