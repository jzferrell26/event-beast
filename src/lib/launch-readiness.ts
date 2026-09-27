import type { Guide } from "./types";

export const launchCheckDefinitions = [
  { key: "content_review", title: "The official program and sponsor order are approved", detail: "Review the real dates, speakers, rooms, dietary details, logos and contractual sponsor placements with the event owner." },
  { key: "email_delivery", title: "Registration, verification and recovery emails work", detail: "Use two independent real inboxes. Confirm verification links, registration matching and a complete password reset." },
  { key: "two_account_messaging", title: "Two attendees can message, reconnect and block", detail: "Use two verified accounts in separate browsers. Test history after reload, a lost connection, duplicate-send retry, read state and blocking." },
  { key: "mobile_offline", title: "Phones, installation and the offline guide are checked", detail: "Check actual iPhone and Android devices. Open the keyboard, install the app, load the guide and then disconnect. Private data must stay out of offline caches." },
  { key: "shared_network", title: "Shared-network and arrival traffic are qualified", detail: "Record the number of simulated arrivals, duration, environment and observed errors. Check email limits, sign-in bursts and concurrent conversations." },
  { key: "production_environment", title: "The dedicated production environment is verified", detail: "Verify the live HTTPS address, dedicated Event Beast database, migrations, email sender, callback URLs and organizer access. Confirm production demo mode is off." },
] as const;
export type LaunchCheckKey = typeof launchCheckDefinitions[number]["key"];
export interface LaunchCheck {
  check_key: LaunchCheckKey; verified: boolean; notes: string; verified_at: string | null;
  verified_by: string | null; version: number; updated_at: string;
}
export interface ReadinessItem {
  key: string; title: string; detail: string; status: "ready" | "needs_attention"; href: string;
}
export interface LaunchReadiness {
  mode: "demo" | "live"; eventName: string; generatedAt: string;
  content: ReadinessItem[]; checks: LaunchCheck[]; approvedAttendees: number;
  contentReady: boolean; organizerChecksRecorded: boolean;
}

/** Deterministic content checks; these never claim a hosted operational test passed. */
export function evaluateContent(guide: Guide, approvedAttendees: number): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const add = (key: string, title: string, ready: boolean, detail: string, href: string) => items.push({ key, title, status: ready ? "ready" : "needs_attention", detail, href });
  const days = guide.days.filter((d) => d.published);
  const dayIds = new Set(days.map((d) => d.id));
  const sessions = guide.sessions.filter((s) => s.published && dayIds.has(s.day_id));
  const sponsors = guide.sponsors.filter((s) => s.published);
  const sponsorIds = new Set(sponsors.map((s) => s.id));
  const speakers = new Set(guide.speakers.filter((s) => s.published).map((s) => s.id));
  const visibleSampleGroups: [string, number, string][] = [
    ["sessions", sessions.filter((s) => s.is_demo).length, "/admin/agenda_sessions"],
    ["speakers", guide.speakers.filter((s) => s.published && s.is_demo).length, "/admin/speakers"],
    ["sponsors", sponsors.filter((s) => s.is_demo).length, "/admin/sponsors"],
    ["lunch options", guide.lunches.filter((s) => s.published && s.is_demo).length, "/admin/lunch_locations"],
    ["venue locations", guide.venues.filter((s) => s.published && s.is_demo).length, "/admin/venue_locations"],
    ["announcements", guide.announcements.filter((s) => s.published && s.is_demo).length, "/admin/announcements"],
  ];
  const sampleGroups = visibleSampleGroups.filter(([, count]) => count > 0);
  const noSamples = guide.mode !== "demo" && !guide.event.is_demo && !sampleGroups.length;
  add("samples", "The attendee guide uses confirmed content", noSamples,
    noSamples ? "No published records are marked sample. The organizer still needs to approve the content below."
      : `${guide.mode === "demo" ? "The application is in demo mode. " : guide.event.is_demo ? "The event is marked as a sample program. " : ""}${sampleGroups.map(([label, count]) => `${count} sample ${label}`).join(", ") || "Replace the sample event configuration before launch."}`,
    sampleGroups[0]?.[2] ?? "/admin");
  const dates = Boolean(guide.event.start_date && guide.event.end_date && guide.event.end_date >= guide.event.start_date);
  const outside = days.filter((d) => dates && (d.date < guide.event.start_date! || d.date > guide.event.end_date!));
  add("dates", "Event dates agree with the agenda", dates && !outside.length,
    !dates ? "Set the confirmed first and last event dates." : outside.length ? `${outside.length} published day(s) fall outside the event dates.` : `${guide.event.start_date} through ${guide.event.end_date}; times use ${guide.event.timezone}.`, "/admin/agenda_days");
  const welcome = Boolean(guide.settings.welcome_title.trim() && guide.settings.welcome_body.trim());
  add("welcome", "The welcome and help details are filled in", welcome && Boolean(guide.settings.support_email.trim() || guide.settings.support_location.trim()),
    welcome ? guide.settings.support_email.trim() || guide.settings.support_location.trim() || "Add a support email or a place to get help." : "Add a welcome headline and useful event message.", "/admin/event_settings");
  const emptyDays = days.filter((d) => !sessions.some((s) => s.day_id === d.id));
  const orphanSessions = guide.sessions.filter((s) => s.published && !dayIds.has(s.day_id));
  const noRoom = sessions.filter((s) => !s.room.trim());
  const missingSpeaker = sessions.filter((s) => ["Keynote", "Workshop", "Panel"].includes(s.session_type) && !guide.sessionSpeakers.some((link) => link.session_id === s.id && speakers.has(link.speaker_id)));
  const agendaGaps = [!days.length ? "No published days." : "", !sessions.length ? "No published sessions." : "", emptyDays.length ? `${emptyDays.length} day(s) have no sessions.` : "", noRoom.length ? `${noRoom.length} session(s) need a location.` : "", orphanSessions.length ? `${orphanSessions.length} published session(s) belong to unpublished days.` : "", missingSpeaker.length ? `${missingSpeaker.length} keynote/workshop/panel session(s) need a published speaker.` : ""].filter(Boolean);
  add("agenda", "The agenda is ready to navigate", !agendaGaps.length, agendaGaps.join(" ") || `${sessions.length} published sessions across ${days.length} event day(s).`, "/admin/agenda_sessions");
  const missingTier = sponsors.filter((s) => !s.tier_id || !guide.tiers.some((t) => t.id === s.tier_id));
  const missingSponsorDetails = sponsors.filter((s) => !s.description.trim() || !s.logo_url.trim() || !s.booth.trim());
  const invalidAds = guide.placements.filter((p) => p.published && (!dayIds.has(p.day_id) || !sponsorIds.has(p.sponsor_id) || (p.after_session_id && !sessions.some((s) => s.id === p.after_session_id && s.day_id === p.day_id))));
  const sponsorGaps = [!sponsors.length ? "No published sponsors." : "", missingTier.length ? `${missingTier.length} sponsor(s) need a configured tier.` : "", missingSponsorDetails.length ? `${missingSponsorDetails.length} sponsor(s) need a logo, description or location.` : "", invalidAds.length ? `${invalidAds.length} agenda placement(s) reference unpublished content.` : ""].filter(Boolean);
  add("sponsors", "Sponsors and agenda placements are complete", !sponsorGaps.length, sponsorGaps.join(" ") || `${sponsors.length} published sponsors. Confirm their contractual order in the organizer review.`, "/admin/sponsors");
  const lunches = guide.lunches.filter((l) => l.published);
  const incompleteLunch = lunches.filter((l) => !l.location.trim() || !l.hours.trim() || !l.dietary_info.trim());
  add("lunch", "Lunch details answer the practical questions", lunches.length > 0 && !incompleteLunch.length,
    !lunches.length ? "Publish the lunch location, times and organizer-supplied dietary information." : incompleteLunch.length ? `${incompleteLunch.length} lunch option(s) need location, hours or dietary information.` : `${lunches.length} lunch option(s) include location, times and dietary notes.`, "/admin/lunch_locations");
  const venues = guide.venues.filter((v) => v.published);
  const incompleteVenues = venues.filter((v) => !v.location.trim() || !v.description.trim());
  add("venue", "Attendees can find their way", venues.length > 0 && !incompleteVenues.length,
    !venues.length ? "Publish the venue locations and where to get help." : incompleteVenues.length ? `${incompleteVenues.length} location(s) need an address/room or helpful directions.` : `${venues.length} venue location(s) published. Check the actual map on a phone before launch.`, "/admin/venue_locations");
  add("roster", "The registration roster is loaded", approvedAttendees > 0,
    approvedAttendees ? `${approvedAttendees} approved registration(s). Importing does not publish profiles or send invitations.` : "Import approved registrations, then verify that attendees can claim the matching email address.", "/admin/attendees");
  return items;
}
