import type { SmartTC } from "./tcGenerator.js";

const ACTIONS = new Set([
  "navigate",
  "click",
  "fill",
  "check",
  "assert",
  "wait",
  "screenshot",
]);

export function parseSmartTcArray(raw: unknown): SmartTC[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SmartTC[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (typeof o.step !== "number") return null;
    if (typeof o.action !== "string" || !ACTIONS.has(o.action)) return null;
    if (typeof o.target !== "string") return null;
    if (typeof o.description !== "string") return null;
    if (typeof o.selector !== "string") return null;
    out.push({
      step: o.step,
      action: o.action as SmartTC["action"],
      target: o.target,
      description: o.description,
      selector: o.selector,
    });
  }
  return out;
}
