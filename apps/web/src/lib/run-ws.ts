export function wsUrlForRun(runId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/runs/${runId}`;
}
