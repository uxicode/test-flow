import { INGEST_ERROR, IngestError } from "./error-codes.js";
import type { FigmaDump } from "./types.js";
import { INGEST_SOURCE } from "./types.js";
import { parseDumpJson, validateDump } from "./validate-dump.js";

export function ingestFromJsonText(raw: string): FigmaDump {
  return validateDump(parseDumpJson(raw));
}

export function ingestFromUnknown(input: unknown): FigmaDump {
  return validateDump(input);
}

export function ingestFromMcp(): never {
  throw new IngestError(INGEST_ERROR.mcpUnavailable);
}

export { INGEST_SOURCE };
