import { z } from "zod";
import { profileSchema } from "@/lib/validation";
import { requireMember } from "@/lib/server/auth";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, profileSchema);
  const { db, event, attendee } = await requireMember();
  if (body.headshot_path) {
    if (!body.headshot_path.startsWith(`${event.id}/${attendee.id}/`)) throw new ApiError(400, "Please upload your own headshot.");
    const image = await db.storage.from("event-headshots").download(body.headshot_path);
    if (image.error || !image.data?.size) throw new ApiError(400, "The headshot upload was not confirmed. Please upload it again.");
  }
  const result = await db.from("attendee_profiles").update(body).eq("event_id", event.id).eq("attendee_id", attendee.id).select("attendee_id").single();
  databaseError(result.error);
  return json({ saved: true });
});

export const PUT = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ onboarding_step: z.number().int().min(0).max(6), onboarding_done: z.boolean() }).strict());
  const { db, event, attendee } = await requireMember();
  const result = await db.from("attendee_preferences").update(body).eq("event_id", event.id).eq("attendee_id", attendee.id);
  databaseError(result.error);
  return json({ saved: true });
});
