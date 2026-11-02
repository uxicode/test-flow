export type ScreenSource = "figma" | "axure";

export interface ScreenSegment {
  screenKey: string;
  screenName: string;
  body: string;
  /** 기획서의 화면 ID. 예: MA-002. 이름에 ID 표기가 없으면 비어 있다. */
  screenId?: string;
  source?: ScreenSource;
}

const SCREEN_ID = /(?<![A-Z\d-])([A-Z]{2,3}-\d{3})(?!\d)/u;

/** `[MA-002] 홈 메인`, `[PI-001]환자정보` 같은 화면 제목에서 화면 ID를 뽑는다. `XX-AP-001` 처럼 접두가 더 붙은 표기는 ID로 보지 않는다. */
export function parseScreenId(title: string): string | undefined {
  return SCREEN_ID.exec(title)?.[1];
}

export interface FeatureSlice {
  title: string;
  body: string;
}

const FEATURE = /^\[([^\]]+)\]\s*([\s\S]*)$/u;

export function readFeatureRows(body: string): FeatureSlice[] {
  const rows: FeatureSlice[] = [];
  let current: FeatureSlice | null = null;
  for (const raw of body.split(/\n/u)) {
    const line = raw.trim();
    if (!line || /^화면\s*설명$/u.test(line) || /^\d+$/u.test(line)) continue;
    const match = FEATURE.exec(line);
    const title = match?.[1]?.trim() ?? "";
    const rest = match?.[2]?.trim() ?? "";
    const isFeature = Boolean(match) && (title.includes(" ") || rest.length >= 8);
    if (isFeature) {
      if (current) rows.push(current);
      current = { title, body: rest };
      continue;
    }
    if (current) current.body = `${current.body}\n${line}`.trim();
  }
  if (current) rows.push(current);
  return rows;
}

export function segmentScreens(lines: string[]): ScreenSegment[] {
  const screens: ScreenSegment[] = [];
  let name = "";
  let body: string[] = [];
  let expectName = false;
  let index = 0;

  function flush(): void {
    if (!name) return;
    index += 1;
    const screenId = parseScreenId(name);
    screens.push({
      screenKey: `screen-${index}`,
      screenName: name.replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim(),
      body: body.join("\n").trim(),
      source: "figma",
      ...(screenId ? { screenId } : {}),
    });
    name = "";
    body = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const inline = /^화면\s*ID\s+(.+)$/u.exec(line);
    if (inline) {
      flush();
      expectName = false;
      name = inline[1] ?? "";
      continue;
    }
    if (/^화면\s*ID$/u.test(line)) {
      flush();
      expectName = true;
      continue;
    }
    if (expectName) {
      expectName = false;
      name = line;
      continue;
    }
    if (name) body.push(line);
  }
  flush();
  return screens.filter((screen) => screen.screenName.length > 0);
}
