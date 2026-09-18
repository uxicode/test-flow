export {
  INGEST_ERROR,
  INGEST_ERROR_MESSAGE,
  IngestError,
  type IngestErrorCode,
} from "./error-codes.js";
export { ingestFromFigmaUrl, type VisionIngestOptions } from "./ingest-from-figma.js";
export { needsVisionAnalysis } from "./needs-vision.js";
export {
  fetchOllamaVisionStatus,
  parseVisionFlowResult,
  requestOllamaVision,
} from "./ollama-vision.js";
export { fetchFigmaNodeImage } from "./figma-rest.js";
export {
  ingestFromJsonText,
  ingestFromMcp,
  ingestFromUnknown,
} from "./ingest.js";
export { parseFigmaUrl } from "./parse-figma-url.js";
export { SAMPLE_CHECKOUT_DUMP } from "./sample-checkout.js";
export { parseDumpJson, validateDump } from "./validate-dump.js";
export {
  DUMP_ANALYSIS_METHOD,
  INGEST_SOURCE,
  type DumpAnalysis,
  type DumpAnalysisMethod,
  type FigmaDump,
  type FigmaDumpSummary,
  type FigmaFlowConnection,
  type FigmaFlowNode,
  type IngestSource,
  type ParsedFigmaUrl,
  type StoredFigmaDump,
} from "./types.js";
export {
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_VISION_MODEL,
  type VisionConnection,
  type VisionFlowResult,
  type VisionScreen,
} from "./vision-types.js";
export { repairVisionFlowResult } from "./repair-vision-flow.js";
export { visionResultToDump } from "./vision-to-dump.js";
