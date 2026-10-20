/** Typed client for the ChronoHeritage v2 API (same-origin, proxied by /api/[...path]). */

export class ApiError extends Error {
  status: number;
  code: string;
  errors: string[];
  detail: unknown;
  constructor(status: number, code: string, message: string, errors: string[] = [], detail: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.detail = detail;
  }
}

const BASE = "/api/v2";

export function parseError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: string; message?: string; errors?: string[] };
    return new ApiError(status, d.code ?? "error", d.message ?? `Request failed (${status})`, d.errors ?? [], detail);
  }
  if (typeof detail === "string") return new ApiError(status, "error", detail);
  if (status === 0) return new ApiError(0, "network", "The API could not be reached. Check that the backend is running.");
  return new ApiError(status, "error", `Request failed with status ${status}.`);
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-chronoheritage-client", "web");
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw parseError(0, null);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw parseError(res.status, data);
  return data as T;
}

export const apiUrl = (path: string) => `${BASE}${path}`;
