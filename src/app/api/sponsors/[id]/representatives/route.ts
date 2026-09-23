import { PROFILE_SELECT } from "@/lib/profile-fields";
import { requireMember, signProfilePhotos } from "@/lib/server/auth";
import { databaseError, handle, json } from "@/lib/server/http";
import { uuid } from "@/lib/validation";
import type { Profile } from "@/lib/types";
export const GET = (_: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  const { db, event } = await requireMember();
  const links = await db.from("sponsor_representatives").select("attendee_id").eq("event_id", event.id).eq("sponsor_id", id);
  databaseError(links.error);
  if (!links.data?.length) return json({ people: [] });
  const profiles = await db.from("attendee_profiles").select(PROFILE_SELECT).eq("event_id", event.id).in("attendee_id", links.data.map((l) => l.attendee_id));
  databaseError(profiles.error);
  return json({ people: await signProfilePhotos(db, (profiles.data ?? []) as Profile[]) });
});
