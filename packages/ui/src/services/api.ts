import { config } from "../config/env.js";
import { getAccessToken } from "./supabase.js";
import type { ApiErrorBody } from "../types/api.js";

/**
 * Error thrown for any non-2xx API response.
 *
 * The server always answers with a structured error envelope, so the code and
 * message can be surfaced directly to the user.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    const fields = details && typeof details === "object"
      ? Object.entries(details).flatMap(([field, errors]) =>
          Array.isArray(errors)
            ? errors.filter((error): error is string => typeof error === "string")
                .map((error) => `${field}: ${error}`)
            : [])
      : [];
    super(fields.length ? `${message}. ${fields.join("; ")}` : message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the failure was caused by an expired or missing session. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True when the failure was a duplicate recipe name. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header (used by the magic-link endpoint). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Unable to reach the server. Check your connection.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text.length > 0 ? safeParse(text) : undefined;

  if (!response.ok) {
    const errorBody = (payload ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      response.status,
      errorBody.error?.code ?? "unknown_error",
      errorBody.error?.message ?? "Request failed",
      errorBody.error?.details,
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, options?: { anonymous?: boolean }) =>
    request<T>(path, { method: "POST", body, anonymous: options?.anonymous }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
