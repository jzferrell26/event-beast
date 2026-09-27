import { z } from "zod";
import { uuid } from "@/lib/validation";
import { requireMember } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = () => handle(async () => {
  if (isDemo()) return json({ sessions: [], attendees: [] });
  const { db, event, attendee } = await requireMember();
  const [sessions, attendees] = await Promise.all([
    db.from("saved_sessions").select("session_id").eq("event_id", event.id).eq("attendee_id", attendee.id),
    db.from("saved_attendees").select("target_id").eq("event_id", event.id).eq("attendee_id", attendee.id),
  ]);
  databaseError(sessions.error); databaseError(attendees.error);
  return json({ sessions: (sessions.data ?? []).map((s) => s.session_id), attendees: (attendees.data ?? []).map((a) => a.target_id) });
});
export const PUT = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ kind: z.enum(["session", "attendee"]), target: uuid, saved: z.boolean() }).strict());
  const { db, event, attendee } = await requireMember();
  const table = body.kind === "session" ? "saved_sessions" : "saved_attendees";
  const column = body.kind === "session" ? "session_id" : "target_id";
  const row = { event_id: event.id, attendee_id: attendee.id, [column]: body.target };
  const result = body.saved ? await db.from(table).insert(row) : await db.from(table).delete().match(row);
  if (result.error?.code !== "23505") databaseError(result.error);
  return json({ saved: body.saved });
});
