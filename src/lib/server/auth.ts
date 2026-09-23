import "server-only";
import { redirect } from "next/navigation";
import { serverSupabase } from "../supabase/server";
import { ApiError, databaseError } from "./http";
import { eventSlug, isDemo } from "./guide";
import type { Profile } from "../types";

export async function getActor() {
  const db = await serverSupabase();
  if (!db) throw new ApiError(503, "Event sign-in is not available yet.");
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ApiError(401, "Please sign in to continue.");
  const event = await db.from("events").select("id,name,timezone").eq("slug", eventSlug()).maybeSingle();
  databaseError(event.error);
  if (!event.data) throw new ApiError(404, "This event is not available.");
  const admin = await db.rpc("is_event_admin", { p_event: event.data.id });
  databaseError(admin.error);
  if (user.email_confirmed_at) {
    const claim = await db.rpc("claim_attendee", { p_event: event.data.id });
    databaseError(claim.error);
  }
  const attendee = await db.from("attendees").select("id,status,directory_allowed").eq("event_id", event.data.id).eq("user_id", user.id).maybeSingle();
  databaseError(attendee.error);
  return { db, user, event: event.data as { id: string; name: string; timezone: string }, attendee: attendee.data as { id: string; status: string; directory_allowed: boolean } | null, isAdmin: Boolean(admin.data) };
}
export async function requireMember() {
  if (isDemo()) throw new ApiError(409, "This is a sample preview. Sign-in and live changes become available when event access opens.");
  const actor = await getActor();
  if (!actor.attendee || actor.attendee.status !== "approved") throw new ApiError(403, "Your account has not been matched to an approved event registration. Please contact the welcome desk.");
  return { ...actor, attendee: actor.attendee };
}
export async function requireAdmin() {
  if (isDemo()) throw new ApiError(409, "This organizer preview is read-only. No event records have been changed.");
  const actor = await getActor();
  if (!actor.isAdmin) throw new ApiError(403, "Organizer access is required.");
  return actor;
}
export async function pageAccess(next: string, admin = false) {
  if (isDemo()) return;
  try { if (admin) await requireAdmin(); else await requireMember(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect(`/access?next=${encodeURIComponent(next)}`);
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
}
export async function signProfilePhotos(db: NonNullable<Awaited<ReturnType<typeof serverSupabase>>>, profiles: Profile[]) {
  const paths = [...new Set(profiles.map((p) => p.headshot_path).filter((p): p is string => Boolean(p)))];
  if (!paths.length) return profiles;
  const { data } = await db.storage.from("event-headshots").createSignedUrls(paths, 120);
  const urls = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl ?? undefined]));
  return profiles.map((p): Profile => ({ ...p, avatar_url: p.headshot_path ? urls.get(p.headshot_path) ?? undefined : undefined }));
}
