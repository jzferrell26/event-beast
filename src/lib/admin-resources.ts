import { z } from "zod";
import { secureUrl, uuid } from "./validation";

export interface AdminField {
  key: string; label: string; kind: "text" | "textarea" | "url" | "email" | "date" | "datetime" | "number" | "boolean" | "select";
  required?: boolean; max?: number; nullable?: boolean; options?: string[]; source?: string; help?: string; initial?: unknown;
}
export interface AdminResource { title: string; singular: string; description: string; titleField: string; subtitleField?: string; singleton?: boolean; order: string; fields: AdminField[] }
const text = (key: string, label: string, max = 160, required = false): AdminField => ({ key, label, kind: "text", max, required });
const paragraph = (key: string, label: string, max = 3000, required = false): AdminField => ({ key, label, kind: "textarea", max, required });
const flag = (key: string, label: string, initial = false): AdminField => ({ key, label, kind: "boolean", initial });
const source = (key: string, label: string, table: string, nullable = false): AdminField => ({ key, label, kind: "select", source: table, nullable, required: !nullable });
const order: AdminField = { key: "sort_order", label: "Display order", kind: "number", initial: 100, help: "Lower numbers appear first. Use the contractual sponsor order." };
const published = flag("published", "Published in the attendee guide");
const sample = flag("is_demo", "This is sample content");
const url = (key: string, label: string): AdminField => ({ key, label, kind: "url", help: "Use an HTTPS link. Leave blank until confirmed." });

export const adminResources: Record<string, AdminResource> = {
  event_settings: { title: "Welcome & app settings", singular: "Welcome content", description: "Set the first impression and the practical details attendees need.", titleField: "welcome_title", singleton: true, order: "event_id", fields: [text("welcome_title", "Welcome headline", 160, true), paragraph("welcome_body", "Welcome message", 600), { key: "support_email", label: "Event support email", kind: "email" }, paragraph("support_location", "Where to find help", 1000), flag("technology_attribution", "Show event technology attribution", true), flag("directory_enabled", "Attendee directory available", true), flag("messaging_enabled", "Private messaging available", true)] },
  announcements: { title: "Event announcements", singular: "Announcement", description: "Publish useful updates. Add an expiry when a notice is time-sensitive.", titleField: "title", subtitleField: "body", order: "created_at", fields: [text("title", "Headline", 160, true), paragraph("body", "Announcement", 4000, true), { key: "severity", label: "Priority", kind: "select", options: ["info", "important", "urgent"], initial: "info" }, { key: "starts_at", label: "Show from", kind: "datetime", nullable: true }, { key: "expires_at", label: "Hide after", kind: "datetime", nullable: true }, published, sample] },
  agenda_days: { title: "Event days", singular: "Event day", description: "Create the event days first, then add sessions to each day.", titleField: "label", subtitleField: "date", order: "sort_order", fields: [text("label", "Day label", 80, true), { key: "date", label: "Event date", kind: "date", required: true }, order, published] },
  agenda_sessions: { title: "Agenda sessions", singular: "Session", description: "A structured, readable agenda with times, speakers and locations.", titleField: "title", subtitleField: "room", order: "starts_at", fields: [source("day_id", "Event day", "agenda_days"), text("title", "Session title", 160, true), paragraph("description", "Session description", 5000), { key: "starts_at", label: "Starts at", kind: "datetime", required: true }, { key: "ends_at", label: "Ends at", kind: "datetime", required: true }, text("room", "Room / location", 160), { key: "session_type", label: "Session type", kind: "select", options: ["Keynote", "Workshop", "Panel", "Networking", "Break", "Session"], initial: "Session" }, source("sponsor_id", "Session sponsor", "sponsors", true), published, sample] },
  speakers: { title: "Speakers", singular: "Speaker", description: "Use organizer-approved names, photographs and biographies.", titleField: "full_name", subtitleField: "title", order: "full_name", fields: [text("full_name", "Speaker name", 120, true), text("title", "Role / title", 160), paragraph("bio", "Biography", 5000), url("headshot_url", "Public headshot URL"), published, sample] },
  session_speakers: { title: "Session speakers", singular: "Speaker assignment", description: "Connect speakers to their sessions. Multiple speakers can share a session.", titleField: "session_id", subtitleField: "speaker_id", order: "id", fields: [source("session_id", "Session", "agenda_sessions"), source("speaker_id", "Speaker", "speakers")] },
  sponsor_tiers: { title: "Sponsor tiers", singular: "Sponsor tier", description: "Set contractual tiers and the order in which they appear.", titleField: "name", order: "sort_order", fields: [text("name", "Tier name", 80, true), order] },
  sponsors: { title: "Sponsors", singular: "Sponsor", description: "Give each partner a clear, useful presence in the event.", titleField: "name", subtitleField: "booth", order: "sort_order", fields: [text("name", "Sponsor name", 120, true), source("tier_id", "Sponsor tier", "sponsor_tiers", true), paragraph("description", "About this sponsor", 3000), url("logo_url", "Public logo URL"), text("booth", "Booth / location", 160), text("cta_label", "Link label", 80), url("cta_url", "Sponsor link"), order, flag("featured", "Featured within its tier and order"), published, sample] },
  agenda_sponsor_placements: { title: "Agenda sponsor placements", singular: "Agenda placement", description: "Place sponsor content between sessions, according to the event agreement.", titleField: "headline", subtitleField: "body", order: "sort_order", fields: [source("day_id", "Event day", "agenda_days"), source("after_session_id", "Place after this session", "agenda_sessions", true), source("sponsor_id", "Sponsor", "sponsors"), text("headline", "Placement headline", 160), paragraph("body", "Placement copy", 500), order, published] },
  sponsor_representatives: { title: "Sponsor representatives", singular: "Representative assignment", description: "Link an attendee to a sponsor. Their profile still follows their own directory privacy choices.", titleField: "sponsor_id", subtitleField: "attendee_id", order: "id", fields: [source("sponsor_id", "Sponsor", "sponsors"), source("attendee_id", "Registered attendee", "attendees")] },
  lunch_locations: { title: "Lunch information", singular: "Lunch option", description: "Publish organizer-supplied times, locations and dietary information.", titleField: "title", subtitleField: "location", order: "sort_order", fields: [text("title", "Lunch option", 160, true), text("location", "Location", 240), text("hours", "Times", 160), paragraph("description", "Description", 3000), paragraph("dietary_info", "Dietary information", 2000), url("directions_url", "Directions link"), url("image_url", "Public image URL"), order, published, sample] },
  venue_locations: { title: "Venue information", singular: "Venue location", description: "Help attendees quickly find the room, booth or person they need.", titleField: "title", subtitleField: "location", order: "sort_order", fields: [text("title", "Location name", 160, true), text("location", "Address / room", 240), paragraph("description", "Helpful details", 3000), url("directions_url", "Directions link"), url("map_url", "Public map image URL"), order, published, sample] },
};

export function getAdminResource(key: string): AdminResource | null { return Object.hasOwn(adminResources, key) ? adminResources[key] : null; }
export function resourceSchema(resource: AdminResource) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of resource.fields) {
    let schema: z.ZodType;
    switch (field.kind) {
      case "boolean": schema = z.boolean(); break;
      case "number": schema = z.number().int().min(0).max(100000); break;
      case "url": schema = secureUrl; break;
      case "email": schema = z.union([z.literal(""), z.email().max(254)]); break;
      case "datetime": schema = z.iso.datetime({ offset: true }); break;
      case "date": schema = z.iso.date(); break;
      case "select": schema = field.source ? uuid : z.enum(field.options as [string, ...string[]]); break;
      default: schema = z.string().trim().min(field.required ? 1 : 0).max(field.max ?? 5000);
    }
    shape[field.key] = field.nullable ? schema.nullable() : schema;
  }
  return z.object(shape).strict().superRefine((record, context) => {
    if (typeof record.starts_at === "string" && typeof record.ends_at === "string" && Date.parse(record.ends_at) <= Date.parse(record.starts_at)) context.addIssue({ code: "custom", path: ["ends_at"], message: "End time must be after start time" });
    if (typeof record.starts_at === "string" && typeof record.expires_at === "string" && Date.parse(record.expires_at) <= Date.parse(record.starts_at)) context.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be after the start" });
  });
}

export function adminDefaults(resource: AdminResource): Record<string, unknown> {
  return Object.fromEntries(resource.fields.map((field) => [field.key, field.initial ?? (field.nullable ? null : field.kind === "boolean" ? false : field.kind === "number" ? 100 : "")]));
}

export function instantToWall(iso: string, timeZone: string): string {
  if (!iso) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Interpret the organizer's clock time in the event zone, regardless of the
// browser's zone. Reject missing/ambiguous DST wall times instead of guessing.
export function wallToInstant(wall: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) throw new Error("Choose a valid date and time.");
  const base = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(base)) throw new Error("Choose a valid date and time.");
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const at = base + hours * 3600000;
    offsets.add(Date.parse(`${instantToWall(new Date(at).toISOString(), timeZone)}:00Z`) - at);
  }
  const matches = [...offsets].map((offset) => new Date(base - offset).toISOString()).filter((iso) => instantToWall(iso, timeZone) === wall);
  if (matches.length !== 1) throw new Error(matches.length ? "This time occurs twice during a daylight-saving change. Choose an unambiguous time." : "This clock time does not exist in the event timezone. Choose another time.");
  return matches[0];
}
