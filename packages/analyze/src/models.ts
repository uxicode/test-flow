export function textModel(): string {
  return process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || "gemma2:9b";
}

export function visionModel(): string {
  return process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:7b";
}

const DEFAULT_VISION_MAX_SIDE = 768;
const DEFAULT_VISION_NUM_CTX = 4096;

export function visionMaxSide(): number {
  const raw = process.env.OLLAMA_VISION_MAX_SIDE?.trim();
  if (!raw) return DEFAULT_VISION_MAX_SIDE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 64) return DEFAULT_VISION_MAX_SIDE;
  return parsed;
}

export function visionNumCtx(): number {
  const raw = process.env.OLLAMA_VISION_NUM_CTX?.trim();
  if (!raw) return DEFAULT_VISION_NUM_CTX;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 512) return DEFAULT_VISION_NUM_CTX;
  return parsed;
}

/** Ollama keep_alive for chat (0 = unload right after response). */
export function ollamaKeepAlive(): number | string {
  const raw = process.env.OLLAMA_KEEP_ALIVE?.trim();
  if (raw === undefined || raw === "") return 0;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;
  return raw;
}
