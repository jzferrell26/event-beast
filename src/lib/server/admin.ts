import "server-only";
import { demoGuide, demoProfiles } from "../demo";
import type { Guide } from "../types";
import { requireAdmin } from "./auth";
import { databaseError } from "./http";
import { isDemo } from "./guide";

export function demoResourceRows(resource: string): Record<string, unknown>[] {
  const map: Record<string, unknown[]> = {
    event_settings: [demoGuide.settings], announcements: demoGuide.announcements, agenda_days: demoGuide.days,
    agenda_sessions: demoGuide.sessions, speakers: demoGuide.speakers, session_speakers: demoGuide.sessionSpeakers.map((link, index) => ({ ...link, id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })),
    sponsors: demoGuide.sponsors, sponsor_tiers: demoGuide.tiers, agenda_sponsor_placements: demoGuide.placements,
    sponsor_representatives: [], lunch_locations: demoGuide.lunches, venue_locations: demoGuide.venues,
    attendees: demoProfiles.map((p, index) => ({ id: p.attendee_id, event_id: p.event_id, registration_name: p.full_name, registration_email: `attendee${index + 1}@example.test`, status: "approved", directory_allowed: true, user_id: null })),
  };
  return (map[resource] ?? []) as Record<string, unknown>[];
}
export const lookupTables: Record<string, string> = { agenda_days: "label", agenda_sessions: "title", speakers: "full_name", sponsors: "name", sponsor_tiers: "name", attendees: "registration_name" };

export async function consoleGuide(): Promise<Guide> {
  if (isDemo()) return demoGuide;
  const { db, event } = await requireAdmin();
  const [eventRow, settings] = await Promise.all([
    db.from("events").select("*").eq("id", event.id).single(), db.from("event_settings").select("*").eq("event_id", event.id).single(),
  ]);
  databaseError(eventRow.error); databaseError(settings.error);
  return { mode: "live", event: eventRow.data, settings: settings.data, days: [], sessions: [], speakers: [], sessionSpeakers: [], sponsors: [], tiers: [], placements: [], lunches: [], venues: [], announcements: [], fetchedAt: new Date().toISOString() } as Guide;
}
