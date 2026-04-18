import { useEffect, useRef } from "react";
import type { RunStatus, ScenarioRunUiState } from "../domain/run-types";
import { wsUrlForRun } from "../lib/run-ws";

export interface RunLogSocketHandlers {
  getTargetScenarioId: () => string | null;
  patchRunUi: (scenarioId: string, patch: Partial<ScenarioRunUiState>) => void;
  appendLog: (scenarioId: string, chunk: string) => void;
  refreshSummaryForScenario: (
    runId: string,
    scenarioId: string,
  ) => Promise<void>;
  onRunComplete: (args: { runId: string; scenarioId: string }) => void;
}

export function useRunLogSocket(
  wsRunId: string | null,
  handlers: RunLogSocketHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!wsRunId) return;
    const socket = new WebSocket(wsUrlForRun(wsRunId));
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          chunk?: string;
          status?: RunStatus;
          log?: string;
        };
        const h = handlersRef.current;
        const sid = h.getTargetScenarioId();
        if (!sid) return;
        if (data.type === "snapshot") {
          const patch: Partial<ScenarioRunUiState> = {};
          if (data.status) patch.status = data.status;
          if (typeof data.log === "string") patch.log = data.log;
          if (Object.keys(patch).length > 0) h.patchRunUi(sid, patch);
          return;
        }
        if (data.type === "log" && typeof data.chunk === "string")
          h.appendLog(sid, data.chunk);
        if (data.type === "status" && data.status)
          h.patchRunUi(sid, { status: data.status });
        if (data.type === "complete") {
          if (data.status) h.patchRunUi(sid, { status: data.status });
          void h.refreshSummaryForScenario(wsRunId, sid);
          h.onRunComplete({ runId: wsRunId, scenarioId: sid });
        }
      } catch {
        /* ignore */
      }
    });
    return () => socket.close();
  }, [wsRunId]);
}
