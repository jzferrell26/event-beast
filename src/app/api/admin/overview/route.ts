import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { demoGuide, demoProfiles } from "@/lib/demo";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";
export const GET = () => handle(async () => {
  if (isDemo()) return json({ registered: demoProfiles.length, approved: demoProfiles.length, linked: 0, sessions: demoGuide.sessions.length, sponsors: demoGuide.sponsors.length, reports: 0, published: true, demo: true });
  const { db, event } = await requireAdmin();
  const [registered, approved, linked, sessions, sponsors, reports, eventRow] = await Promise.all([
    db.from("attendees").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    db.from("attendees").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "approved"),
    db.from("attendees").select("id", { count: "exact", head: true }).eq("event_id", event.id).not("user_id", "is", null),
    db.from("agenda_sessions").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("published", true),
    db.from("sponsors").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("published", true),
    db.from("reports").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "open"),
    db.from("events").select("published").eq("id", event.id).single(),
  ]);
  [registered, approved, linked, sessions, sponsors, reports, eventRow].forEach((r) => databaseError(r.error));
  return json({ registered: registered.count ?? 0, approved: approved.count ?? 0, linked: linked.count ?? 0, sessions: sessions.count ?? 0, sponsors: sponsors.count ?? 0, reports: reports.count ?? 0, published: eventRow.data?.published, demo: false });
});
export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ name: z.string().trim().min(1).max(160), tagline: z.string().trim().max(300), start_date: z.iso.date().nullable(), end_date: z.iso.date().nullable(), published: z.boolean(), is_demo: z.boolean() }).strict().refine((b) => !b.start_date || !b.end_date || b.end_date >= b.start_date, "The end date must be on or after the start date"));
  const { db, event } = await requireAdmin();
  const result = await db.from("events").update(body).eq("id", event.id).select("id").single();
  databaseError(result.error);
  return json({ saved: true });
});
