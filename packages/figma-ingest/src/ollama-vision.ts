import { INGEST_ERROR, IngestError } from "./error-codes.js";
import type { FetchLike } from "./figma-rest.js";
import { repairVisionFlowResult } from "./repair-vision-flow.js";
import { safeParseJson } from "./safe-parse-json.js";
import type { VisionConnection, VisionFlowResult, VisionScreen } from "./vision-types.js";
import { DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_VISION_MODEL } from "./vision-types.js";

export const VISION_PROMPT = `당신은 프로세스맵·플로우차트·UI를 Mermaid flowchart로 옮기는 전문가입니다.
첨부 이미지에서 보이는 상자(노드)와 화살표(간선)를 추출하여 오직 순수 JSON으로만 응답하세요.

반드시 지킬 규칙:
1. 프로세스맵/플로우차트/다이어그램이면 보이는 상자마다 screens에 항목을 1개씩 만든다.
   제목 상자, 단계 상자, 분기 상자(존재함/존재하지 않음, 승인/반려 등)도 각각 별도 노드다.
2. 화살표마다 connections에 항목을 1개씩 만든다. from/to는 반드시 screens에 있는 id만 쓴다.
3. 한 상자 안의 입력 필드(이름, 이메일 등)는 별도 상자가 아니면 그 상자의 text로만 넣고 노드를 쪼개지 않는다.
4. 분기 화살표의 label에는 화살표 옆 텍스트만 넣는다. 일반 직선 화살표는 label을 비운다.
5. 여러 레인/컬럼이 있으면 각 상자에 group으로 레인 제목을 넣는다.
6. 모든 단계를 하나의 screens 항목 text에 번호 목록으로 합치지 않는다. 그렇게 하면 Mermaid 변환이 실패한다.
7. 버튼·폼만 있고 화살표 플로우가 없는 UI 스크린샷일 때만 screens를 1개로 둔다.
8. 이미지에 없는 상자나 화살표를 만들지 않는다.

JSON 출력 형식:
{
  "screens": [
    { "id": "s1", "name": "상자 텍스트", "group": "레인 제목", "text": "상자 안 부가 텍스트" }
  ],
  "connections": [
    { "from": "s1", "to": "s2", "label": "분기 라벨 또는 빈 문자열" }
  ]
}`;

function resolveModel(model?: string): string {
  if (!model || model.includes("llama") || model.includes("llava"))
    return DEFAULT_OLLAMA_VISION_MODEL;
  return model;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseScreens(value: unknown): VisionScreen[] {
  if (!Array.isArray(value)) return [];
  const screens: VisionScreen[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = asString(record.id).trim();
    const name = asString(record.name).trim();
    const text = asString(record.text).trim();
    if (!id && !name && !text) continue;
    const group = asString(record.group).trim();
    screens.push({
      id: id || `s${screens.length + 1}`,
      name,
      text: text || undefined,
      group: group || undefined,
    });
  }
  return screens;
}

function parseConnections(value: unknown): VisionConnection[] {
  if (!Array.isArray(value)) return [];
  const connections: VisionConnection[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const from = asString(record.from).trim();
    const to = asString(record.to).trim();
    if (!from || !to) continue;
    const label = asString(record.label).trim();
    connections.push({ from, to, label: label || undefined });
  }
  return connections;
}

export function parseVisionFlowResult(content: string): VisionFlowResult {
  const parsed = safeParseJson(content);
  if (!parsed) throw new IngestError(INGEST_ERROR.visionFailed);
  const screens = parseScreens(parsed.screens ?? parsed.nodes);
  const connections = parseConnections(parsed.connections ?? parsed.edges);
  if (screens.length === 0 && connections.length === 0)
    throw new IngestError(INGEST_ERROR.visionEmpty);
  const repaired = repairVisionFlowResult({ screens, connections });
  if (repaired.screens.length === 0)
    throw new IngestError(INGEST_ERROR.visionEmpty);
  return repaired;
}

export async function requestOllamaVision(options: {
  imageBase64: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  fetchImpl?: FetchLike;
}): Promise<{ result: VisionFlowResult; model: string }> {
  const ollamaUrl = options.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL;
  const model = resolveModel(options.ollamaModel);
  const fetchImpl = options.fetchImpl ?? fetch;
  const cleanBase64 = options.imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  try {
    const response = await fetchImpl(`${ollamaUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: VISION_PROMPT,
            images: [cleanBase64],
          },
        ],
        format: "json",
        stream: false,
        options: {
          temperature: 0.0,
          num_ctx: 16384,
        },
      }),
    });

    if (response.status >= 400) {
      const errBody = (await response.json().catch(() => ({}))) as {
        error?: string | { message?: string };
      };
      const detail =
        typeof errBody.error === "string"
          ? errBody.error
          : errBody.error?.message ?? `HTTP ${response.status}`;
      throw new IngestError(INGEST_ERROR.visionUnavailable, detail);
    }

    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content ?? "";
    return { result: parseVisionFlowResult(content), model };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new IngestError(INGEST_ERROR.visionFailed, "시간 초과");
    throw new IngestError(
      INGEST_ERROR.visionUnavailable,
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchOllamaVisionStatus(options: {
  ollamaUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<{
  connected: boolean;
  url: string;
  models: string[];
  hasVisionModel: boolean;
  recommendedModel: string;
}> {
  const url = options.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const recommendedModel = DEFAULT_OLLAMA_VISION_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    if (response.status >= 400)
      return {
        connected: false,
        url,
        models: [],
        hasVisionModel: false,
        recommendedModel,
      };
    const body = (await response.json()) as { models?: { name?: string }[] };
    const models = (body.models ?? [])
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name));
    const hasVisionModel = models.some((name) =>
      /vision|vl|llava|minicpm-v|bakllava|moondream/i.test(name),
    );
    return {
      connected: true,
      url,
      models,
      hasVisionModel,
      recommendedModel:
        models.find((name) => name.includes("qwen2.5vl") || name.includes("qwen")) ??
        recommendedModel,
    };
  } catch {
    return {
      connected: false,
      url,
      models: [],
      hasVisionModel: false,
      recommendedModel,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
