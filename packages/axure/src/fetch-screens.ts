import type { ScreenSegment } from "@testflow/figma";
import { readAxureNotes, readAxurePages, type AxureNote, type AxurePage } from "./axure-pages.js";

export interface TextFetchLike {
  (url: string): Promise<{ status: number; text: () => Promise<string> }>;
}

/** Axure Cloud 게시본 주소인지 본다. 예: `https://xxxx.axshare.com/...` */
export function isAxureUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "axshare.com" || host.endsWith(".axshare.com");
  } catch {
    return false;
  }
}

/** Axure 에서 `(Rectangle)` 처럼 사람이 이름 붙이지 않은 기본 라벨. */
const DEFAULT_LABEL = /^\(.*\)$/u;

/** 말풍선 하나를 Figma 와 같은 `[제목] 본문` 줄로 만든다. */
export function noteToLines(note: AxureNote): string[] {
  const named = note.label && !DEFAULT_LABEL.test(note.label) ? ` ${note.label}` : "";
  const [first = "", ...rest] = note.lines;
  return [`[${note.no}${named}] ${first}`.trimEnd(), ...rest];
}

export function pageToScreen(page: AxurePage, notes: AxureNote[], index: number): ScreenSegment {
  return {
    screenKey: `axure-${index}`,
    screenName: page.pageName.replace(/[[\]]/gu, " ").replace(/\s+/gu, " ").trim(),
    body: notes.flatMap(noteToLines).join("\n"),
    source: "axure",
    ...(page.screenId ? { screenId: page.screenId } : {}),
  };
}

/** 사이트맵의 `url`(`x.html`)에서 페이지 데이터 경로를 만든다. */
export function pageDataPath(page: AxurePage): string {
  const slug = page.url.replace(/\.html$/iu, "");
  return `files/${slug.split("/").map(encodeURIComponent).join("/")}/data.js`;
}

async function readText(fetchImpl: TextFetchLike, url: string, what: string): Promise<string> {
  const response = await fetchImpl(url);
  if (response.status === 401 || response.status === 403) {
    throw new Error(`${what}에 접근할 수 없습니다. 프로토타입이 공개 상태인지 확인하세요.`);
  }
  if (response.status >= 400) throw new Error(`${what}를 가져오지 못했습니다. HTTP ${response.status}`);
  return response.text();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 입력 주소가 특정 페이지를 가리키면 그 페이지만, 게시본 루트나 목록이면 null 을 돌려준다.
 * `/_pi-001_환자정보.html` 과 뷰어 주소 `/?id=…&p=_pi-001_환자정보` 둘 다 받는다.
 */
export function pickRequestedPage(pages: AxurePage[], baseUrl: string): AxurePage | null {
  const url = new URL(baseUrl);
  const fromPath = safeDecode(url.pathname.replace(/^\/+/u, ""));
  const fromQuery = url.searchParams.get("p");
  const wanted = (fromPath.endsWith(".html") ? fromPath : fromQuery ? `${safeDecode(fromQuery)}.html` : "").toLowerCase();
  if (!wanted) return null;
  return pages.find((page) => page.url.toLowerCase() === wanted) ?? null;
}

/**
 * Axure Cloud 게시본에서 화면을 읽는다. 로그인 없이 열리는 게시본만 지원한다.
 * `baseUrl` 은 게시본 주소(`https://xxx.axshare.com`)나 그 아래 페이지 주소 어느 쪽이든 된다.
 */
export async function fetchAxureScreens(options: {
  baseUrl: string;
  /** 읽을 페이지를 고른다. 기본은 주소가 가리키는 페이지 하나, 주소에 페이지가 없으면 화면 ID 가 있는 페이지 전부. */
  pageFilter?: (page: AxurePage) => boolean;
  fetchImpl?: TextFetchLike;
  concurrency?: number;
}): Promise<ScreenSegment[]> {
  const origin = new URL(options.baseUrl).origin;
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));

  const documentJs = await readText(fetchImpl, `${origin}/data/document.js`, "Axure 문서 목록");
  const allPages = readAxurePages(documentJs);
  const requested = options.pageFilter ? null : pickRequestedPage(allPages, options.baseUrl);
  const pages = options.pageFilter
    ? allPages.filter(options.pageFilter)
    : requested
      ? [requested]
      : allPages.filter((page) => Boolean(page.screenId));

  const screens: ScreenSegment[] = new Array<ScreenSegment>(pages.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < pages.length) {
      const index = cursor;
      cursor += 1;
      const page = pages[index];
      if (!page) continue;
      const dataJs = await readText(fetchImpl, `${origin}/${pageDataPath(page)}`, `Axure 페이지 ${page.pageName}`);
      screens[index] = pageToScreen(page, readAxureNotes(dataJs), index + 1);
    }
  };
  const size = Math.max(1, Math.min(options.concurrency ?? 4, pages.length));
  await Promise.all(Array.from({ length: size }, worker));
  return screens;
}
