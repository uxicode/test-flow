import { extractFlowGraph } from "./extract-flow-graph.js";
import type { FetchLike } from "./figma-rest.js";
import { fetchFigmaNodeImage, fetchFlowRoots } from "./figma-rest.js";
import { needsVisionAnalysis } from "./needs-vision.js";
import { requestOllamaVision } from "./ollama-vision.js";
import { parseFigmaUrl } from "./parse-figma-url.js";
import type { FigmaDump } from "./types.js";
import { validateDump } from "./validate-dump.js";
import type { VisionFlowResult } from "./vision-types.js";
import { visionResultToDump } from "./vision-to-dump.js";

export interface VisionIngestOptions {
  enabled?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  analyze?: (imageBase64: string) => Promise<VisionFlowResult>;
}

export async function ingestFromFigmaUrl(options: {
  url: string;
  token: string;
  fetchImpl?: FetchLike;
  vision?: VisionIngestOptions;
}): Promise<FigmaDump> {
  const parsed = parseFigmaUrl(options.url);
  const roots = await fetchFlowRoots({
    fileKey: parsed.fileKey,
    startNodeId: parsed.startNodeId,
    token: options.token,
    fetchImpl: options.fetchImpl,
  });
  const dump = extractFlowGraph({
    fileKey: parsed.fileKey,
    startNodeId: parsed.startNodeId,
    roots,
  });
  const visionEnabled = options.vision?.enabled !== false;
  if (!visionEnabled || !needsVisionAnalysis(dump, roots))
    return validateDump(dump);

  const imageBase64 = await fetchFigmaNodeImage({
    fileKey: parsed.fileKey,
    nodeId: parsed.startNodeId,
    token: options.token,
    fetchImpl: options.fetchImpl,
  });
  const fallbackName = roots[0]?.name?.trim() || parsed.startNodeId;
  if (options.vision?.analyze) {
    const result = await options.vision.analyze(imageBase64);
    return validateDump(
      visionResultToDump({
        fileKey: parsed.fileKey,
        startNodeId: parsed.startNodeId,
        fallbackName,
        result,
        model: options.vision.ollamaModel,
      }),
    );
  }

  const { result, model } = await requestOllamaVision({
    imageBase64,
    ollamaUrl: options.vision?.ollamaUrl,
    ollamaModel: options.vision?.ollamaModel,
    fetchImpl: options.fetchImpl,
  });
  return validateDump(
    visionResultToDump({
      fileKey: parsed.fileKey,
      startNodeId: parsed.startNodeId,
      fallbackName,
      result,
      model,
    }),
  );
}
