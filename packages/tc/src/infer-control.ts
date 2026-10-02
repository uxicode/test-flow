import { CONTROL_KIND, type ControlKind } from "./control-kind.js";

const OPTION_LIST =
  /(?:선택\s*항목|옵션|항목)\s*[:：]?\s*([^\n.]+)/iu;
const COMMA_OPTIONS = /(전체|남성|여성|Y|N|[A-Za-z가-힣]{1,12})(?:\s*[,，、/|]\s*(전체|남성|여성|Y|N|[A-Za-z가-힣]{1,12}))+/u;

export function parseOptionList(text: string): string[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const labeled = OPTION_LIST.exec(trimmed)?.[1];
  const source = labeled ?? (COMMA_OPTIONS.test(trimmed) ? trimmed : "");
  if (!source) return undefined;

  const parts = source
    .split(/[,，、/|]/u)
    .map((part) => part.replace(/^[(\[]|[)\]]$/gu, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  return [...new Set(parts)];
}

export function inferControlKind(text: string, options?: string[]): ControlKind {
  const blob = text.toLowerCase();
  if (/combobox|콤보|드롭\s*다운\s*버튼|버튼.*(?:열|펼)/iu.test(text))
    return CONTROL_KIND.combobox;
  if (/date\s*picker|캘린더|달력/iu.test(text)) {
    if (/시작\s*일|종료\s*일|기간|range|~\s*종료/u.test(text)) return CONTROL_KIND.dateRange;
    return CONTROL_KIND.date;
  }
  if (/type\s*=\s*"?date/iu.test(text) || /검사\s*일|등록\s*일|조회\s*기간/u.test(text)) {
    if (/시작|종료|기간|~\s*종료|date\s*picker|캘린더|달력/u.test(text))
      return CONTROL_KIND.dateRange;
    if (/검사\s*일|등록\s*일|조회\s*기간/u.test(text)) return CONTROL_KIND.dateRange;
    return CONTROL_KIND.date;
  }
  if (/checkbox|체크\s*박스|다중\s*선택/u.test(text)) return CONTROL_KIND.checkbox;
  if (options && options.length >= 2) {
    if (/radio|라디오|단일\s*선택/u.test(text) && !/드롭|콤보|필터/u.test(text))
      return CONTROL_KIND.radio;
    if (/type\s*=\s*"?select|<\s*select|네이티브\s*select|선택\s*상자/u.test(text))
      return CONTROL_KIND.select;
    if (/select|드롭\s*다운|콤보|필터/u.test(text)) return CONTROL_KIND.combobox;
    if (options.length <= 5) return CONTROL_KIND.combobox;
    return CONTROL_KIND.combobox;
  }
  if (/필터/u.test(text) && /남성|여성|전체/u.test(text)) return CONTROL_KIND.combobox;
  if (blob.includes("select")) return CONTROL_KIND.select;
  return CONTROL_KIND.text;
}

export function defaultOptionValue(options: string[], hint?: string): string {
  const normalizedHint = hint?.trim();
  if (normalizedHint && options.includes(normalizedHint)) return normalizedHint;
  const preferred = options.find((item) => item !== "전체" && item !== "ALL");
  return preferred ?? options[0] ?? "";
}
