import { useEffect, useRef } from "react";

export function useRunSummaryPoll(
  wsRunId: string | null,
  getScenarioId: () => string | null,
  refreshSummaryForScenario: (
    runId: string,
    scenarioId: string,
  ) => Promise<void>,
  intervalMs = 4000,
): void {
  const refreshRef = useRef(refreshSummaryForScenario);
  refreshRef.current = refreshSummaryForScenario;
  const getSidRef = useRef(getScenarioId);
  getSidRef.current = getScenarioId;

  useEffect(() => {
    if (!wsRunId) return;
    const sid = getSidRef.current();
    if (!sid) return;
    const tick = (): void => {
      const currentSid = getSidRef.current() ?? sid;
      void refreshRef.current(wsRunId, currentSid);
    };
    const t = window.setInterval(tick, intervalMs);
    tick();
    return () => window.clearInterval(t);
  }, [wsRunId, intervalMs]);
}
