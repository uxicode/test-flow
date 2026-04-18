import { fetchJson } from "../lib/http";
import type { Scenario, ScenarioSummary } from "../types";

export class ScenarioApi {
  list(): Promise<ScenarioSummary[]> {
    return fetchJson<ScenarioSummary[]>("/api/scenarios");
  }

  get(id: string): Promise<Scenario> {
    return fetchJson<Scenario>(`/api/scenarios/${id}`);
  }

  create(body: Record<string, unknown>): Promise<Scenario> {
    return fetchJson<Scenario>("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  update(id: string, body: Record<string, unknown>): Promise<Scenario> {
    return fetchJson<Scenario>(`/api/scenarios/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    if (!res.ok)
      throw new Error(`DELETE failed: ${res.status} ${res.statusText}`);
  }
}
