import { z } from "zod";
import { uuid } from "@/lib/validation";
import { requireMember } from "@/lib/server/auth";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = () => handle(async () => {
  const { db, event, attendee } = await requireMember();
  const result = await db.from("blocks").select("blocked_id,created_at").eq("event_id", event.id).eq("blocker_id", attendee.id).order("created_at", { ascending: false });
  databaseError(result.error);
  return json({ blocks: (result.data ?? []).map((b, index) => ({ blocked_id: b.blocked_id, label: `Blocked attendee ${index + 1} · ${b.blocked_id.slice(-6)}` })) });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), target: uuid, blocked: z.boolean() }),
  z.object({ action: z.literal("report"), target: uuid, reason: z.string().trim().min(3).max(2000), messageId: z.number().int().positive().optional() }),
]);
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, schema);
  const { db, event } = await requireMember();
  const result = body.action === "block"
    ? await db.rpc("set_attendee_block", { p_event: event.id, p_target: body.target, p_blocked: body.blocked })
    : await db.rpc("report_attendee", { p_event: event.id, p_target: body.target, p_reason: body.reason, p_message_id: body.messageId ?? null });
  databaseError(result.error);
  return json({ saved: true });
});
