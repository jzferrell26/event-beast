import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";

const schema = z.object({
  session_id: z.uuid(),
  status: z.enum(["pending", "confirmed", "excluded"]),
  notes: z.string().trim().max(2000),
  expected_version: z.number().int().min(0),
}).strict().refine((value) => value.status === "pending" || value.notes.length >= 3, {
  message: "Describe the organizer's decision.", path: ["notes"],
});

export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, schema);
  const { db, event } = await requireAdmin();
  const result = await db.rpc("record_agenda_review", {
    p_event: event.id, p_session: body.session_id, p_status: body.status,
    p_notes: body.notes, p_expected_version: body.expected_version,
  });
  databaseError(result.error);
  return json({ saved: true, review: result.data });
});
