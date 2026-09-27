import { PROFILE_SELECT } from "@/lib/profile-fields";
import { demoProfiles } from "@/lib/demo";
import type { Profile } from "@/lib/types";
import { uuid } from "@/lib/validation";
import { requireMember, signProfilePhotos } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json } from "@/lib/server/http";

export const GET = (_: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  if (isDemo()) {
    const profile = demoProfiles.find((p) => p.attendee_id === id);
    if (!profile) throw new ApiError(404, "This attendee is not available in the directory.");
    return json({ profile });
  }
  const { db, event } = await requireMember();
  const result = await db.from("attendee_profiles").select(PROFILE_SELECT).eq("event_id", event.id).eq("attendee_id", id).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This attendee is not available in the directory.");
  return json({ profile: (await signProfilePhotos(db, [result.data as Profile]))[0] });
});
