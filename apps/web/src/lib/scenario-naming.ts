export function scenarioNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host ? `테스트: ${host}` : "새 시나리오";
  } catch {
    return "새 시나리오";
  }
}
