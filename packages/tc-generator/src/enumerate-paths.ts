import type { FigmaDump, FigmaFlowConnection, FigmaFlowNode } from "@testflow/figma-ingest";
import { TC_ERROR, TcError } from "./error-codes.js";

export interface PathHop {
  node: FigmaFlowNode;
  viaLabel?: string;
}

export function enumeratePaths(dump: FigmaDump): PathHop[][] {
  if (dump.nodes.length === 0) throw new TcError(TC_ERROR.emptyGraph);
  const byId = new Map(dump.nodes.map((node) => [node.id, node]));
  const start = byId.get(dump.startNodeId);
  if (!start) throw new TcError(TC_ERROR.startNotFound, dump.startNodeId);

  const outgoing = new Map<string, FigmaFlowConnection[]>();
  for (const edge of dump.connections) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const paths: PathHop[][] = [];

  function walk(current: FigmaFlowNode, viaLabel: string | undefined, trail: PathHop[]) {
    const nextTrail = [...trail, { node: current, viaLabel }];
    const edges = (outgoing.get(current.id) ?? []).filter(
      (edge) => !nextTrail.some((hop) => hop.node.id === edge.to),
    );
    if (edges.length === 0) {
      paths.push(nextTrail);
      return;
    }
    for (const edge of edges) {
      const target = byId.get(edge.to);
      if (!target) continue;
      walk(target, edge.label, nextTrail);
    }
  }

  walk(start, undefined, []);
  if (paths.length === 0) throw new TcError(TC_ERROR.emptyGraph);
  return paths;
}
