import { type AnalysisWorker } from "./types.js";

export function createOllamaWorker(options?: {
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AnalysisWorker {
  const baseUrl = (options?.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/u, "");
  const model = options?.model || process.env.OLLAMA_MODEL || "gemma2:9b";
  const fetchImpl = options?.fetchImpl ?? fetch;

  return {
    async ask(input) {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [{ role: "user", content: input.text }],
        }),
        signal: input.signal,
      });
      if (!response.ok) throw new Error(`Ollama 요청에 실패했습니다. HTTP ${response.status}`);
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
