import fs from "node:fs";
import path from "node:path";
import type { ScreenAnalysis } from "./types.js";

function resolveDir(): string {
  const fromEnv = process.env.ANALYSIS_FILE_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "../../data/analysis");
}

function filePath(dir: string, jobId: string): string {
  // jobId 는 경로로 쓰이므로 영숫자·하이픈만 남긴다.
  return path.join(dir, `${jobId.replace(/[^A-Za-z0-9-]/gu, "")}.json`);
}

/** 분석 결과(화면별 입력 규칙)를 저장한다. 이후 TC 는 모델 없이 이 파일로 다시 만들 수 있다. */
export function saveAnalysisFile(
  jobId: string,
  screens: ScreenAnalysis[],
  dir: string = resolveDir(),
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(dir, jobId), JSON.stringify({ jobId, screens }, null, 2), "utf8");
}

export function loadAnalysisFile(
  jobId: string,
  dir: string = resolveDir(),
): ScreenAnalysis[] | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath(dir, jobId), "utf8"));
    if (typeof parsed !== "object" || parsed === null || !("screens" in parsed)) return null;
    const { screens } = parsed as { screens: unknown };
    return Array.isArray(screens) ? (screens as ScreenAnalysis[]) : null;
  } catch {
    return null;
  }
}
