import { PROFILE_SELECT } from "@/lib/profile-fields";
import { demoProfiles } from "@/lib/demo";
import type { Profile } from "@/lib/types";
import { requireMember, signProfilePhotos } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json } from "@/lib/server/http";

export const GET = (request: Request) => handle(async () => {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").slice(0, 100).replace(/[^\p{L}\p{N} @.\-]/gu, "").trim();
  const interest = (params.get("interest") ?? "").slice(0, 60);
  const offset = Math.max(0, Math.min(Number(params.get("offset")) || 0, 10000));
  if (isDemo()) {
    const filtered = demoProfiles.filter((p) => (!query || `${p.full_name} ${p.company} ${p.title} ${p.city}`.toLowerCase().includes(query.toLowerCase())) && (!interest || p.interests.includes(interest)));
    return json({ people: filtered.slice(offset, offset + 30), hasMore: filtered.length > offset + 30 });
  }
  const { db, event, attendee } = await requireMember();
  let search = db.from("attendee_profiles").select(PROFILE_SELECT).eq("event_id", event.id).eq("directory_visible", true).order("full_name").order("attendee_id").range(offset, offset + 30);
  if (params.get("saved") === "true") {
    const favorites = await db.from("saved_attendees").select("target_id").eq("event_id", event.id).eq("attendee_id", attendee.id);
    databaseError(favorites.error);
    const ids = (favorites.data ?? []).map((a) => a.target_id);
    if (!ids.length) return json({ people: [], hasMore: false });
    search = search.in("attendee_id", ids);
  }
  if (query) search = search.or(`full_name.ilike.%${query}%,company.ilike.%${query}%,title.ilike.%${query}%,city.ilike.%${query}%`);
  if (interest) search = search.contains("interests", [interest]);
  const result = await search;
  databaseError(result.error);
  const people = await signProfilePhotos(db, (result.data ?? []).slice(0, 30) as Profile[]);
  return json({ people, hasMore: (result.data?.length ?? 0) > 30 });
});
