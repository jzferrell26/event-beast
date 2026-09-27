import { z } from "zod";
import type { Guide } from "@/lib/types";
import { demoGuide, demoProfiles } from "@/lib/demo";
import { evaluateContent, launchCheckDefinitions, type LaunchCheck, type LaunchCheckKey } from "@/lib/launch-readiness";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = () => handle(async () => {
  let guide: Guide = demoGuide;
  let approvedAttendees = demoProfiles.length;
  let checks: LaunchCheck[] = [];
  if (!isDemo()) {
    const { db, event } = await requireAdmin();
    const tables = ["agenda_days", "agenda_sessions", "speakers", "session_speakers", "sponsors", "sponsor_tiers", "agenda_sponsor_placements", "lunch_locations", "venue_locations", "announcements"];
    const [eventResult, settings, roster, checkResult, ...content] = await Promise.all([
      db.from("events").select("*").eq("id", event.id).single(),
      db.from("event_settings").select("*").eq("event_id", event.id).single(),
      db.from("attendees").select("id", { head: true, count: "exact" }).eq("event_id", event.id).eq("status", "approved"),
      db.from("launch_checks").select("check_key,verified,notes,verified_at,verified_by,version,updated_at").eq("event_id", event.id),
      ...tables.map((table) => db.from(table).select("*").eq("event_id", event.id).limit(1000)),
    ]);
    [eventResult, settings, roster, checkResult, ...content].forEach((result) => databaseError(result.error));
    // This event is much smaller than the limit. Refuse incomplete readiness
    // instead of silently certifying a partial dataset if it grows beyond it.
    if (content.some((result) => (result.data?.length ?? 0) >= 1000)) throw new ApiError(409, "This event exceeds the launch review page limit. Review all content before marking launch checks complete.");
    const [days, sessions, speakers, sessionSpeakers, sponsors, tiers, placements, lunches, venues, announcements] = content.map((result) => result.data ?? []);
    guide = { mode: "live", event: eventResult.data, settings: settings.data, days, sessions, speakers, sessionSpeakers, sponsors, tiers, placements, lunches, venues, announcements, fetchedAt: new Date().toISOString() } as Guide;
    approvedAttendees = roster.count ?? 0;
    checks = (checkResult.data ?? []) as LaunchCheck[];
  }
  const items = evaluateContent(guide, approvedAttendees);
  return json({ mode: guide.mode, eventName: guide.event.name, generatedAt: new Date().toISOString(), content: items, checks, approvedAttendees,
    contentReady: items.every((item) => item.status === "ready"),
    organizerChecksRecorded: launchCheckDefinitions.every((definition) => checks.some((check) => check.check_key === definition.key && check.verified)),
  });
});

export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({
    check_key: z.enum(launchCheckDefinitions.map((c) => c.key) as [LaunchCheckKey, ...LaunchCheckKey[]]),
    verified: z.boolean(), notes: z.string().trim().max(2000), expected_version: z.number().int().min(0),
  }).strict().refine((value) => !value.verified || value.notes.length >= 3, { message: "Describe how this check was verified.", path: ["notes"] }));
  const { db, event } = await requireAdmin();
  const result = await db.rpc("record_launch_check", { p_event: event.id, p_key: body.check_key, p_verified: body.verified, p_notes: body.notes, p_expected_version: body.expected_version });
  if (result.error?.code === "40001") throw new ApiError(409, "Another organizer updated this check. Close this form and refresh before saving again.");
  databaseError(result.error);
  return json({ saved: true, check: result.data });
});
