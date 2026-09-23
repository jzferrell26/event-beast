"use client";

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(url, { ...init, headers, cache: "no-store", signal: init.signal ?? controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new RequestError(response.status, data.error || "We could not complete that request. Please try again.");
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new Error("The connection timed out. Your action has not been confirmed. Please retry.");
    throw new Error("Connection unavailable. Check your internet connection and try again.");
  } finally { window.clearTimeout(timeout); }
}
export const mutate = <T = { saved: boolean }>(url: string, method: string, body: unknown) => request<T>(url, { method, body: JSON.stringify(body) });
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
