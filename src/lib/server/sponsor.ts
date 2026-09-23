import "server-only";
import { demoGuide } from "../demo";
import type { Guide } from "../types";
import { requireSponsor } from "./auth";
import { isDemo } from "./guide";
import { databaseError } from "./http";

export async function sponsorWorkspaceGuide(): Promise<Guide> {
  if (isDemo()) return demoGuide;
  const { db, event } = await requireSponsor();
  const [details, settings] = await Promise.all([
    db.from("events").select("*").eq("id", event.id).single(),
    db.from("event_settings").select("*").eq("event_id", event.id).single(),
  ]);
  databaseError(details.error); databaseError(settings.error);
  return { mode: "live", event: details.data, settings: settings.data, days: [], sessions: [], speakers: [],
    sessionSpeakers: [], sponsors: [], tiers: [], placements: [], lunches: [], venues: [], announcements: [], fetchedAt: new Date().toISOString() } as Guide;
}
