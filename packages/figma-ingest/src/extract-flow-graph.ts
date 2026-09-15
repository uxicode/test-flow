import type { FigmaApiNode, FigmaReactionAction } from "./figma-api-types.js";
import type { FigmaDump, FigmaFlowConnection, FigmaFlowNode } from "./types.js";

const SCREEN_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
]);

const GROUPING_TYPES = new Set([
  "DOCUMENT",
  "CANVAS",
  "PAGE",
  "SECTION",
  "GROUP",
]);

function firstText(node: FigmaApiNode): string | undefined {
  if (typeof node.characters === "string" && node.characters.trim())
    return node.characters.trim();
  for (const child of node.children ?? []) {
    const text = firstText(child);
    if (text) return text;
  }
  return undefined;
}

function walk(node: FigmaApiNode, visit: (current: FigmaApiNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function buildParentMap(roots: FigmaApiNode[]): Map<string, string | null> {
  const parentById = new Map<string, string | null>();
  for (const root of roots) {
    parentById.set(root.id, null);
    walk(root, (current) => {
      for (const child of current.children ?? [])
        parentById.set(child.id, current.id);
    });
  }
  return parentById;
}

function collectScreenNodes(root: FigmaApiNode): FigmaApiNode[] {
  if (SCREEN_TYPES.has(root.type)) return [root];
  const screens: FigmaApiNode[] = [];
  for (const child of root.children ?? []) {
    if (SCREEN_TYPES.has(child.type)) screens.push(child);
    else if (GROUPING_TYPES.has(child.type))
      screens.push(...collectScreenNodes(child));
  }
  return screens;
}

function owningScreenId(
  nodeId: string,
  screenIds: Set<string>,
  parentById: Map<string, string | null>,
): string | null {
  let current: string | null = nodeId;
  while (current) {
    if (screenIds.has(current)) return current;
    current = parentById.get(current) ?? null;
  }
  return null;
}

function reactionActions(node: FigmaApiNode): FigmaReactionAction[] {
  const actions: FigmaReactionAction[] = [];
  for (const reaction of node.reactions ?? []) {
    if (reaction.action) actions.push(reaction.action);
    if (reaction.actions) actions.push(...reaction.actions);
  }
  return actions;
}

function destinationIds(node: FigmaApiNode): { id: string; label?: string }[] {
  const results: { id: string; label?: string }[] = [];
  if (node.transitionNodeID) results.push({ id: node.transitionNodeID });
  for (const action of reactionActions(node)) {
    if (action.destinationId)
      results.push({ id: action.destinationId, label: action.type });
  }
  if (node.type === "CONNECTOR") {
    const from = node.connectorStart?.endpointNodeId;
    const to = node.connectorEnd?.endpointNodeId;
    if (from && to) results.push({ id: `${from}=>${to}`, label: node.name });
  }
  return results;
}

export function collectMissingNodeIds(
  roots: FigmaApiNode[],
  knownIds: Set<string>,
): string[] {
  const missing = new Set<string>();
  const parentById = buildParentMap(roots);
  const screens = roots.flatMap(collectScreenNodes);
  const screenIds = new Set(screens.map((screen) => screen.id));

  for (const root of roots) {
    walk(root, (node) => {
      if (node.type === "CONNECTOR") {
        const from = node.connectorStart?.endpointNodeId;
        const to = node.connectorEnd?.endpointNodeId;
        if (from && !knownIds.has(from)) missing.add(from);
        if (to && !knownIds.has(to)) missing.add(to);
        return;
      }
      for (const dest of destinationIds(node)) {
        if (dest.id.includes("=>")) continue;
        const owner = owningScreenId(dest.id, screenIds, parentById);
        if (!owner && !knownIds.has(dest.id)) missing.add(dest.id);
      }
    });
  }
  return [...missing];
}

export function extractFlowGraph(input: {
  fileKey: string;
  startNodeId: string;
  roots: FigmaApiNode[];
}): FigmaDump {
  const screens = input.roots.flatMap(collectScreenNodes);
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const screenIds = new Set(byId.keys());
  const parentById = buildParentMap(input.roots);
  const connections: FigmaFlowConnection[] = [];
  const seen = new Set<string>();

  function addEdge(from: string, to: string, label?: string) {
    const key = `${from}|${to}|${label ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    connections.push({ from, to, label });
  }

  for (const root of input.roots) {
    walk(root, (node) => {
      if (node.type === "CONNECTOR") {
        const fromRaw = node.connectorStart?.endpointNodeId;
        const toRaw = node.connectorEnd?.endpointNodeId;
        if (!fromRaw || !toRaw) return;
        const from = owningScreenId(fromRaw, screenIds, parentById) ?? fromRaw;
        const to = owningScreenId(toRaw, screenIds, parentById) ?? toRaw;
        addEdge(from, to, node.name || undefined);
        return;
      }
      const from =
        owningScreenId(node.id, screenIds, parentById) ??
        (screenIds.has(node.id) ? node.id : null);
      if (!from) return;
      for (const dest of destinationIds(node)) {
        if (dest.id.includes("=>")) continue;
        const to = owningScreenId(dest.id, screenIds, parentById) ?? dest.id;
        addEdge(from, to, dest.label);
      }
    });
  }

  const referenced = new Set<string>([input.startNodeId]);
  for (const edge of connections) {
    referenced.add(edge.from);
    referenced.add(edge.to);
  }

  const allKnown = new Map<string, FigmaApiNode>();
  for (const root of input.roots)
    walk(root, (node) => {
      allKnown.set(node.id, node);
    });
  for (const screen of screens) allKnown.set(screen.id, screen);

  const nodes: FigmaFlowNode[] = [...referenced].map((id) => {
    const source = allKnown.get(id);
    if (source)
      return {
        id: source.id,
        name: source.name,
        type: source.type,
        text: firstText(source),
      };
    return { id, name: id, type: "UNKNOWN" };
  });

  return {
    fileKey: input.fileKey,
    startNodeId: input.startNodeId,
    nodes,
    connections,
  };
}
