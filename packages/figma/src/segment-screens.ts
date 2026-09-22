export interface ScreenSegment {
  screenKey: string;
  screenName: string;
  body: string;
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
    screens.push({
      screenKey: `screen-${index}`,
      screenName: name.replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim(),
      body: body.join("\n").trim(),
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
