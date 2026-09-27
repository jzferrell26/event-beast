import { z } from "zod";
import { uuid } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { demoResourceRows } from "@/lib/server/admin";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";
export const GET = (request: Request) => handle(async () => {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 100).replace(/[^\p{L}\p{N} @.\-]/gu, "").trim();
  const status = params.get("status") ?? "";
  if (status && !["approved", "pending", "disabled"].includes(status)) throw new ApiError(400, "Choose a valid access status.");
  if (isDemo()) return json({ rows: demoResourceRows("attendees").filter((r) => (!q || `${r.registration_name} ${r.registration_email}`.toLowerCase().includes(q.toLowerCase())) && (!status || r.status === status)), hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(params.get("offset")) || 0, 10000));
  let query = db.from("attendees").select("id,registration_name,registration_email,status,directory_allowed,user_id,created_at").eq("event_id", event.id).order("registration_name").order("id").range(offset, offset + 50);
  if (q) query = query.or(`registration_name.ilike.%${q}%,registration_email.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const result = await query;
  databaseError(result.error);
  return json({ rows: (result.data ?? []).slice(0, 50), hasMore: (result.data?.length ?? 0) > 50 });
});
export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ id: uuid, registration_name: z.string().trim().min(1).max(120), registration_email: z.email().max(254), status: z.enum(["approved", "pending", "disabled"]), directory_allowed: z.boolean() }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.rpc("update_attendee_access", { p_event: event.id, p_attendee: body.id, p_name: body.registration_name, p_email: body.registration_email.trim().toLowerCase(), p_status: body.status, p_directory_allowed: body.directory_allowed });
  databaseError(result.error);
  return json({ saved: true });
});
