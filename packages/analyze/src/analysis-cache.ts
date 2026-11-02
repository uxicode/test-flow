import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 질문 하나에 대한 모델 원시응답을 보관하는 저장소. */
export interface AnalysisCache {
  get(key: string): string | null;
  set(key: string, raw: string): void;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * 같은 프롬프트·모델·화면 이미지면 같은 응답을 재사용하도록 키를 만든다.
 * 프롬프트 본문이 키에 들어가므로 프롬프트 규칙을 고치면 이전 캐시는 자연히 쓰이지 않는다.
 */
export function questionCacheKey(input: {
  prompt: string;
  model: string;
  image?: string | null;
}): string {
  return sha256(
    [input.model, input.image ? sha256(input.image) : "no-image", input.prompt].join("\u0000"),
  );
}

function resolveDir(): string {
  const fromEnv = process.env.ANALYSIS_CACHE_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "../../data/analysis-cache");
}

export function createFileAnalysisCache(dir: string = resolveDir()): AnalysisCache {
  function file(key: string): string {
    return path.join(dir, `${key}.txt`);
  }
  return {
    get(key) {
      try {
        return fs.readFileSync(file(key), "utf8");
      } catch {
        return null;
      }
    },
    set(key, raw) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file(key), raw, "utf8");
      } catch {
        // 캐시 저장 실패는 분석 결과에 영향을 주지 않는다.
      }
    },
  };
}
