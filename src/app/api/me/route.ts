import { demoMe } from "@/lib/demo";
import type { Profile } from "@/lib/types";
import { getActor, signProfilePhotos } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json } from "@/lib/server/http";

export const GET = () => handle(async () => {
  if (isDemo()) return json(demoMe);
  try {
    const actor = await getActor();
    const eligible = actor.attendee?.status === "approved";
    let profile: Profile | null = null;
    let preferences = null;
    if (eligible && actor.attendee) {
      const [p, prefs] = await Promise.all([
        actor.db.from("attendee_profiles").select("*").eq("event_id", actor.event.id).eq("attendee_id", actor.attendee.id).maybeSingle(),
        actor.db.from("attendee_preferences").select("onboarding_step,onboarding_done").eq("event_id", actor.event.id).eq("attendee_id", actor.attendee.id).maybeSingle(),
      ]);
      databaseError(p.error); databaseError(prefs.error);
      profile = p.data ? (await signProfilePhotos(actor.db, [p.data as Profile]))[0] : null;
      preferences = prefs.data;
    }
    let sponsorIds: string[] = [];
    if (eligible && actor.attendee?.access_role === "sponsor") {
      const assignments = await actor.db.from("sponsor_editors").select("sponsor_id").eq("event_id", actor.event.id).eq("attendee_id", actor.attendee.id);
      databaseError(assignments.error);
      sponsorIds = (assignments.data ?? []).map((a) => a.sponsor_id);
    }
    return json({ mode: "live", authenticated: true, eligible, isAdmin: actor.isAdmin, attendeeId: actor.attendee?.id ?? null,
      role: actor.isAdmin ? "admin" : eligible ? actor.attendee?.access_role : null, sponsorIds,
      email: actor.user.email, profile, preferences, directoryAllowed: actor.attendee?.directory_allowed, status: actor.attendee?.status });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return json({ mode: "live", authenticated: false, eligible: false, isAdmin: false, attendeeId: null, profile: null, preferences: null });
    throw error;
  }
});
