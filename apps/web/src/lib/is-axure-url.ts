/** Axure Cloud 게시본 주소인지 본다. 서버의 판별 규칙(`@testflow/axure`)과 같게 유지한다. */
export function isAxureUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "axshare.com" || host.endsWith(".axshare.com");
  } catch {
    return false;
  }
}
