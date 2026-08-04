const DEV_API_WS = "ws://127.0.0.1:3001";

export function wsBaseUrl(): string {
  if (import.meta.env.DEV) {
    const configured = import.meta.env.VITE_API_WS_URL;
    if (typeof configured === "string" && configured.trim() !== "") {
      return configured.trim().replace(/\/$/, "");
    }
    return DEV_API_WS;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

export function wsUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${wsBaseUrl()}${normalized}`;
}
