export function textModel(): string {
  return process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || "gemma2:9b";
}

export function visionModel(): string {
  return process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:7b";
}

const DEFAULT_VISION_MAX_SIDE = 768;
const DEFAULT_VISION_NUM_CTX = 4096;
const DEFAULT_NUM_PREDICT = 1500;

/**
 * 피그마 화면 이미지를 비전 모델에 함께 넣을지. 기본은 끔(텍스트만 분석).
 * 피그마 텍스트 레이어만으로 충분하고, 읽기 어려운 축소 이미지는 모델이 같은 답을 반복하며 오래 걸리게 한다.
 */
export function visionEnabled(): boolean {
  const raw = process.env.ANALYSIS_USE_VISION?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function visionMaxSide(): number {
  const raw = process.env.OLLAMA_VISION_MAX_SIDE?.trim();
  if (!raw) return DEFAULT_VISION_MAX_SIDE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 64) return DEFAULT_VISION_MAX_SIDE;
  return parsed;
}

/** 질문 하나에서 모델이 생성할 수 있는 최대 토큰. 표 행마다 입력을 뽑으며 끝없이 길어지는 것을 막는다. */
export function ollamaNumPredict(): number {
  const raw = process.env.OLLAMA_NUM_PREDICT?.trim();
  if (!raw) return DEFAULT_NUM_PREDICT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 128) return DEFAULT_NUM_PREDICT;
  return parsed;
}

export function visionNumCtx(): number {
  const raw = process.env.OLLAMA_VISION_NUM_CTX?.trim();
  if (!raw) return DEFAULT_VISION_NUM_CTX;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 512) return DEFAULT_VISION_NUM_CTX;
  return parsed;
}

/**
 * 분석 작업 동안 모델을 올려 둘 keep_alive.
 * 작업이 끝나면 직접 내리므로, 이 값은 내리지 못하고 끝났을 때(프로세스 종료 등) Ollama 가 스스로 내리는 상한이다.
 */
export const ANALYSIS_KEEP_ALIVE = "5m";

/** Ollama keep_alive for chat (0 = unload right after response). */
export function ollamaKeepAlive(): number | string {
  const raw = process.env.OLLAMA_KEEP_ALIVE?.trim();
  if (raw === undefined || raw === "") return 0;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;
  return raw;
}
