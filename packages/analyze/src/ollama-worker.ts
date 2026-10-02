import { ollamaKeepAlive, textModel, visionNumCtx } from "./models.js";
import { type AnalysisWorker } from "./types.js";

export function ollamaErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    if (typeof parsed.error === "string") {
      try {
        const inner = JSON.parse(parsed.error) as { error?: { message?: string } };
        if (inner.error?.message) return inner.error.message;
      } catch {
        return parsed.error;
      }
      return parsed.error;
    }
  } catch {
    return trimmed.slice(0, 300);
  }
  return trimmed.slice(0, 300);
}

export function createOllamaWorker(options?: {
  baseUrl?: string;
  model?: string;
  numCtx?: number;
  fetchImpl?: typeof fetch;
}): AnalysisWorker {
  const baseUrl = (options?.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/u, "");
  const model = options?.model || textModel();
  const fetchImpl = options?.fetchImpl ?? fetch;

  return {
    async ask(input) {
      const message: { role: string; content: string; images?: string[] } = {
        role: "user",
        content: input.text,
      };
      if (input.images?.length) message.images = input.images;
      const numCtx = options?.numCtx ?? (input.images?.length ? visionNumCtx() : undefined);
      const keepAlive = ollamaKeepAlive();
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          keep_alive: keepAlive,
          messages: [message],
          ...(numCtx ? { options: { num_ctx: numCtx } } : {}),
        }),
        signal: input.signal,
      });
      if (!response.ok) {
        const detail = ollamaErrorText(await response.text().catch(() => ""));
        throw new Error(
          detail
            ? `Ollama 요청에 실패했습니다. HTTP ${response.status} · ${detail}`
            : `Ollama 요청에 실패했습니다. HTTP ${response.status}`,
        );
      }
      const payload = (await response.json()) as { message?: { content?: string } };
      const content = payload.message?.content;
      if (!content) throw new Error("Ollama 응답이 비어 있습니다.");
      return content;
    },
    async unload() {
      await fetchImpl(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }),
      }).catch(() => undefined);
    },
  };
}
