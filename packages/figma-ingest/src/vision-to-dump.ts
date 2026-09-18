import { INGEST_ERROR, IngestError } from "./error-codes.js";
import {
  DUMP_ANALYSIS_METHOD,
  type FigmaDump,
  type FigmaFlowConnection,
} from "./types.js";
import type { VisionFlowResult } from "./vision-types.js";

function sanitizeId(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  const safe = trimmed.replace(/[^\w:.-]/g, "_");
  return safe || fallback;
}

export function visionResultToDump(input: {
  fileKey: string;
  startNodeId: string;
  fallbackName: string;
  result: VisionFlowResult;
  model?: string;
}): FigmaDump {
  const screens = input.result.screens.filter(
    (screen) => screen.name.trim() || Boolean(screen.text?.trim()),
  );
  if (screens.length === 0) throw new IngestError(INGEST_ERROR.visionEmpty);

  const idMap = new Map<string, string>();
  const used = new Set<string>([input.startNodeId]);
  idMap.set(screens[0].id, input.startNodeId);

  for (let index = 1; index < screens.length; index += 1) {
    const fallback = `vision-${index + 1}`;
    let mapped = sanitizeId(screens[index].id, fallback);
    if (used.has(mapped)) mapped = `${mapped}_${index + 1}`;
    used.add(mapped);
    idMap.set(screens[index].id, mapped);
  }

  const nodes = screens.map((screen, index) => {
    const id = idMap.get(screen.id) ?? input.startNodeId;
    return {
      id,
      name:
        screen.name.trim() ||
        (index === 0 ? input.fallbackName : `화면 ${index + 1}`),
      type: "VISION_SCREEN",
      text: screen.text?.trim() || undefined,
      group: screen.group?.trim() || undefined,
    };
  });

  const seen = new Set<string>();
  const connections: FigmaFlowConnection[] = [];
  for (const edge of input.result.connections) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to || from === to) continue;
    const label = edge.label?.trim() || undefined;
    const key = `${from}|${to}|${label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connections.push({ from, to, label });
  }

  return {
    fileKey: input.fileKey,
    startNodeId: input.startNodeId,
    nodes,
    connections,
    analysis: {
      method: DUMP_ANALYSIS_METHOD.vision,
      model: input.model,
    },
  };
}
