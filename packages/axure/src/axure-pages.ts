import { parseScreenId } from "@testflow/figma";
import { parseAxureData, type AxureObject, type AxureValue } from "./parse-axure-data.js";
import { htmlToLines } from "./html-text.js";

export interface AxurePage {
  pageName: string;
  /** 사이트맵의 url. 예: `_pi-001_환자정보.html` */
  url: string;
  type: string;
  screenId?: string;
}

export interface AxureNote {
  /** 말풍선 번호. 예: `1`, `1.1` */
  no: string;
  label: string;
  lines: string[];
}

function isObject(value: AxureValue | undefined): value is AxureObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: AxureValue | undefined): string {
  return typeof value === "string" ? value : "";
}

/** `document.js` 의 사이트맵을 평탄화한다. 폴더는 건너뛰고 페이지만 돌려준다. */
export function readAxurePages(documentJs: string): AxurePage[] {
  const sitemap = parseAxureData(documentJs).sitemap;
  const roots = isObject(sitemap) && Array.isArray(sitemap.rootNodes) ? sitemap.rootNodes : [];
  const pages: AxurePage[] = [];
  const visit = (nodes: AxureValue[]): void => {
    for (const node of nodes) {
      if (!isObject(node)) continue;
      const url = text(node.url);
      const pageName = text(node.pageName);
      if (url && pageName) {
        const screenId = parseScreenId(pageName);
        pages.push({ pageName, url, type: text(node.type), ...(screenId ? { screenId } : {}) });
      }
      if (Array.isArray(node.children)) visit(node.children);
    }
  };
  visit(roots);
  return pages;
}

/** 페이지 `data.js` 의 주석(Note)을 번호순으로 읽는다. */
export function readAxureNotes(pageDataJs: string): AxureNote[] {
  const page = parseAxureData(pageDataJs).page;
  const annotations = isObject(page) && Array.isArray(page.annotations) ? page.annotations : [];
  const notes: AxureNote[] = [];
  for (const item of annotations) {
    if (!isObject(item)) continue;
    const lines = htmlToLines(text(item.Note));
    if (lines.length === 0) continue;
    notes.push({ no: text(item.fn), label: text(item.label).trim(), lines });
  }
  return notes.sort((a, b) => compareNo(a.no, b.no));
}

function compareNo(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? -1) - (right[i] ?? -1);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
  }
  return 0;
}
