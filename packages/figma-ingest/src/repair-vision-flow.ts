import type { VisionConnection, VisionFlowResult, VisionScreen } from "./vision-types.js";

const NUMBERED_STEP = /^(?:#{1,3}\s*)?(\d+)[.)]\s+(.+)$/;

function incomingLabel(
  id: string,
  connections: VisionConnection[],
): string | undefined {
  return connections.find((edge) => edge.to === id && edge.label?.trim())
    ?.label
    ?.trim();
}

function expandNumberedFlow(screen: VisionScreen): VisionFlowResult | null {
  const lines = (screen.text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    const match = NUMBERED_STEP.exec(line);
    if (!match?.[2]) continue;
    const name = match[2].trim();
    if (name) steps.push(name);
  }
  if (steps.length < 2) return null;

  const title = screen.name.trim() || steps[0] || screen.id;
  const screens: VisionScreen[] = [{ id: screen.id, name: title }];
  const connections: VisionConnection[] = [];
  let previousId = screen.id;
  for (const step of steps) {
    if (screens.length === 1 && title === step) continue;
    const id = `s${screens.length + 1}`;
    screens.push({ id, name: step });
    connections.push({ from: previousId, to: id });
    previousId = id;
  }
  if (connections.length === 0) return null;
  return { screens, connections };
}

export function repairVisionFlowResult(
  result: VisionFlowResult,
): VisionFlowResult {
  const screens = result.screens.map((screen) => ({ ...screen }));
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const missing: string[] = [];

  for (const edge of result.connections) {
    if (!byId.has(edge.from) && !missing.includes(edge.from))
      missing.push(edge.from);
    if (!byId.has(edge.to) && !missing.includes(edge.to)) missing.push(edge.to);
  }

  for (const id of missing) {
    const name = incomingLabel(id, result.connections) || id;
    const screen: VisionScreen = { id, name };
    screens.push(screen);
    byId.set(id, screen);
  }

  if (screens.length > 1 && result.screens.length === 1 && screens[0])
    screens[0] = { ...screens[0], text: undefined };

  if (screens.length === 1 && result.connections.length === 0 && screens[0]) {
    const expanded = expandNumberedFlow(screens[0]);
    if (expanded) return expanded;
  }

  const connections = result.connections.map((edge) => {
    const destination = byId.get(edge.to);
    if (destination && edge.label?.trim() === destination.name)
      return { from: edge.from, to: edge.to };
    return edge;
  });

  return {
    screens,
    connections,
  };
}
