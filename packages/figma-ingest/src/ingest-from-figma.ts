import { extractFlowGraph } from "./extract-flow-graph.js";
import type { FetchLike } from "./figma-rest.js";
import { fetchFlowRoots } from "./figma-rest.js";
import { parseFigmaUrl } from "./parse-figma-url.js";
import type { FigmaDump } from "./types.js";
import { validateDump } from "./validate-dump.js";

export async function ingestFromFigmaUrl(options: {
  url: string;
  token: string;
  fetchImpl?: FetchLike;
}): Promise<FigmaDump> {
  const parsed = parseFigmaUrl(options.url);
  const roots = await fetchFlowRoots({
    fileKey: parsed.fileKey,
    startNodeId: parsed.startNodeId,
    token: options.token,
    fetchImpl: options.fetchImpl,
  });
  return validateDump(
    extractFlowGraph({
      fileKey: parsed.fileKey,
      startNodeId: parsed.startNodeId,
      roots,
    }),
  );
}
