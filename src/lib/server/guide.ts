import "server-only";
import { cache } from "react";
import { unstable_cache, revalidateTag } from 'next/cache';
import { demoGuide } from "../demo";
import type { Guide } from "../types";
import { publicSupabase } from "../supabase/server";
import { databaseError } from "./http";

export const isDemo = () => process.env.EVENT_BEAST_DEMO_MODE === "true";
export const eventSlug = () => process.env.EVENT_BEAST_EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || "momentum-builder-live-2026";
const PUBLIC_GUIDE_TAG = 'event-beast-public-guide';
export function invalidatePublicGuide() { revalidateTag(PUBLIC_GUIDE_TAG, { expire: 0 }); }

const loadPublicGuide = async (slug: string): Promise<Guide | null> => {
  const db = publicSupabase();
  if (!db) return null;
  const eventResult = await db.from("events").select("id,slug,name,tagline,timezone,start_date,end_date,published,public_guide,is_demo")
    .eq("slug", slug).eq("published", true).eq("public_guide", true).maybeSingle();
  databaseError(eventResult.error);
  if (!eventResult.data) return null;
  const event = eventResult.data as Guide["event"];
  const [settings, days, sessions, speakers, links, sponsors, tiers, placements, lunches, venues, announcements] = await Promise.all([
    db.from("event_settings").select("*").eq("event_id", event.id).single(),
    db.from("agenda_days").select("*").eq("event_id", event.id).eq("published", true).order("sort_order"),
    db.from("agenda_sessions").select("*").eq("event_id", event.id).eq("published", true).order("starts_at"),
    db.from("speakers").select("*").eq("event_id", event.id).eq("published", true),
    db.from("session_speakers").select("event_id,session_id,speaker_id").eq("event_id", event.id),
    db.from("sponsors").select("*").eq("event_id", event.id).eq("published", true).order("sort_order"),
    db.from("sponsor_tiers").select("*").eq("event_id", event.id).order("sort_order"),
    db.from("agenda_sponsor_placements").select("*").eq("event_id", event.id).eq("published", true).order("sort_order"),
    db.from("lunch_locations").select("*").eq("event_id", event.id).eq("published", true).order("sort_order"),
    db.from("venue_locations").select("*").eq("event_id", event.id).eq("published", true).order("sort_order"),
    db.from("announcements").select("*").eq("event_id", event.id).eq("published", true).order("created_at", { ascending: false }),
  ]);
  [settings, days, sessions, speakers, links, sponsors, tiers, placements, lunches, venues, announcements].forEach((r) => databaseError(r.error));
  const publishedDays = new Set((days.data ?? []).map((d) => d.id));
  const publishedSponsors = new Set((sponsors.data ?? []).map((s) => s.id));
  return {
    mode: "live", event, settings: settings.data,
    days: days.data ?? [], sessions: (sessions.data ?? []).filter((s) => publishedDays.has(s.day_id)),
    speakers: speakers.data ?? [], sessionSpeakers: links.data ?? [], sponsors: sponsors.data ?? [], tiers: tiers.data ?? [],
    placements: (placements.data ?? []).filter((p) => publishedDays.has(p.day_id) && publishedSponsors.has(p.sponsor_id)),
    lunches: lunches.data ?? [], venues: venues.data ?? [], announcements: announcements.data ?? [], fetchedAt: new Date().toISOString(),
  } as Guide;
};

// Only the cookie-free, RLS-limited public guide enters shared server cache.
// Registration, profiles, messages and Admin reads remain uncached.
const cachedPublicGuide = unstable_cache(loadPublicGuide, ['public-guide-v2', process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unconfigured'], { revalidate: 15, tags: [PUBLIC_GUIDE_TAG] });
export const getGuide = cache(async (): Promise<Guide | null> => isDemo() ? demoGuide : cachedPublicGuide(eventSlug()));
