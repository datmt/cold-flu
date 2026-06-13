import type { ApiErrorResponse } from "@/lib/types";

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as ApiErrorResponse).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function formatDateTime(value: number | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

export function formatDuration(startedAt: number | null | undefined, finishedAt: number | null | undefined) {
  if (!startedAt || !finishedAt) {
    return "—";
  }

  return `${Math.max(0, finishedAt - startedAt)}ms`;
}
