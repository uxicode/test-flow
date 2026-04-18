export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok)
    throw new Error(`요청 실패: ${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
