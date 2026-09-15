import { INGEST_ERROR, IngestError } from "./error-codes.js";
import type { FigmaDump, FigmaFlowConnection, FigmaFlowNode } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNode(value: unknown): FigmaFlowNode {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id)
    throw new IngestError(INGEST_ERROR.invalidSchema, "node.id가 필요합니다.");
  if (typeof value.name !== "string")
    throw new IngestError(INGEST_ERROR.invalidSchema, `node ${value.id}에 name이 필요합니다.`);
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === "string" ? value.type : undefined,
    text: typeof value.text === "string" ? value.text : undefined,
  };
}

function parseConnection(value: unknown): FigmaFlowConnection {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string")
    throw new IngestError(INGEST_ERROR.invalidSchema, "connection.from/to가 필요합니다.");
  return {
    from: value.from,
    to: value.to,
    label: typeof value.label === "string" ? value.label : undefined,
  };
}

export function parseDumpJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new IngestError(INGEST_ERROR.invalidJson);
  }
}

export function validateDump(input: unknown): FigmaDump {
  if (!isRecord(input)) throw new IngestError(INGEST_ERROR.invalidSchema);
  if (typeof input.fileKey !== "string" || !input.fileKey)
    throw new IngestError(INGEST_ERROR.invalidSchema, "fileKey가 필요합니다.");
  if (typeof input.startNodeId !== "string" || !input.startNodeId)
    throw new IngestError(INGEST_ERROR.invalidSchema, "startNodeId가 필요합니다.");
  if (!Array.isArray(input.nodes))
    throw new IngestError(INGEST_ERROR.invalidSchema, "nodes 배열이 필요합니다.");
  if (!Array.isArray(input.connections))
    throw new IngestError(INGEST_ERROR.invalidSchema, "connections 배열이 필요합니다.");

  const nodes = input.nodes.map(parseNode);
  if (nodes.length === 0) throw new IngestError(INGEST_ERROR.emptyGraph);

  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(input.startNodeId))
    throw new IngestError(INGEST_ERROR.nodeNotFound, input.startNodeId);

  const connections = input.connections.map(parseConnection);
  const dangling = connections.find(
    (edge) => !ids.has(edge.from) || !ids.has(edge.to),
  );
  if (dangling)
    throw new IngestError(
      INGEST_ERROR.danglingEdge,
      `${dangling.from} → ${dangling.to}`,
    );

  return {
    fileKey: input.fileKey,
    startNodeId: input.startNodeId,
    nodes,
    connections,
  };
}
