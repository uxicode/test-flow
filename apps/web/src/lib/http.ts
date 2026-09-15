export interface ApiErrorBody {
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error ?? "request_failed",
      body.message ?? `요청 실패: ${response.status}`,
    );
  }
  return body;
}

export async function getJson<T>(url: string): Promise<T> {
  return parseResponse<T>(await fetch(url));
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return parseResponse<T>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  return parseResponse<T>(
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteJson<T>(url: string): Promise<T> {
  return parseResponse<T>(await fetch(url, { method: "DELETE" }));
}

export async function patchJson<T>(url: string, body: unknown): Promise<T> {
  return parseResponse<T>(
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
