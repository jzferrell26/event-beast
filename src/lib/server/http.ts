import "server-only";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestUrl = new URL(request.url);
  const expectedOrigin = host ? `${forwardedProto || requestUrl.protocol.replace(":", "") }://${host}` : requestUrl.origin;
  if (!origin || origin !== expectedOrigin) throw new ApiError(403, "Please submit this request from Event Beast.");
}
export async function parseBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 32768): Promise<T> {
  assertSameOrigin(request);
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new ApiError(413, "This request is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiError(413, "This request is too large.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ApiError(400, "Please submit valid form data."); }
  return schema.parse(data);
}
export function databaseError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new ApiError(403, error.message);
  if (error.code === "22023" || error.code === "23514") throw new ApiError(400, error.message);
  if (error.code === "23505") throw new ApiError(409, "This record already exists.");
  if (error.code === "40001") throw new ApiError(409, error.message);
  if (error.code === "23503") throw new ApiError(409, "This item is in use or refers to content outside this event.");
  if (error.code === "P0001") throw new ApiError(429, error.message);
  console.error("Event Beast database request failed", { code: error.code });
  throw new ApiError(503, "We could not complete that request. Please try again.");
}
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (error instanceof ApiError) {
      const response = json({ error: error.message }, error.status);
      if (error.status === 429) response.headers.set('Retry-After', '5');
      return response;
    }
    if (error instanceof z.ZodError) return json({ error: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
    console.error("Event Beast request failed", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Something went wrong. Your changes have not been confirmed. Please try again." }, 500);
  }
}
