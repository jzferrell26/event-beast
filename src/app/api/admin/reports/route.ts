import { z } from "zod";
import { uuid } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";
export const GET = (request: Request) => handle(async () => {
  if (isDemo()) return json({ rows: [], hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get("offset")) || 0, 10000));
  const result = await db.rpc("moderation_queue", { p_event: event.id, p_offset: offset });
  databaseError(result.error);
  return json({ rows: result.data ?? [], hasMore: result.data?.length === 50 });
});
export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ id: uuid, status: z.enum(["open", "reviewed", "dismissed"]) }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.from("reports").update({ status: body.status }).eq("event_id", event.id).eq("id", body.id).select("id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This report is unavailable.");
  return json({ saved: true });
});
