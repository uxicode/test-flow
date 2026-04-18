import type { SmartTC, Step } from "../types";

/** Steps -> SmartTC via `/api/tc/convert`. */
export class SmartTcFromStepsService {
  async convert(steps: Step[]): Promise<SmartTC[] | null> {
    const res = await fetch("/api/tc/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tc?: SmartTC[] };
    if (data.tc && data.tc.length > 0) return data.tc;
    return null;
  }
}
