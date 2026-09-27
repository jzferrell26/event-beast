import { z } from "zod";
import { secureUrl, uuid } from "./validation";

export type EventRole = "admin" | "sponsor" | "member";
export const roleDescriptions: Record<EventRole, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Full control of event content, sponsors, settings, users and permissions." },
  sponsor: { label: "Sponsor", description: "Attendee access plus editing for the sponsor pages assigned to this user." },
  member: { label: "Member", description: "The attendee app: agenda, people, conversations, saved sessions and their own profile." },
};
export const eventUserSchema = z.object({
  id: uuid.nullable(), expected_version: z.number().int().nonnegative().nullable(),
  registration_name: z.string().trim().min(1).max(120), registration_email: z.email().max(254),
  role: z.enum(["admin", "sponsor", "member"]), status: z.enum(["approved", "pending", "disabled"]),
  directory_allowed: z.boolean(), sponsor_ids: z.array(uuid).max(20),
}).strict().superRefine((data, context) => {
  if (data.role === "sponsor" ? !data.sponsor_ids.length : Boolean(data.sponsor_ids.length)) context.addIssue({ code: "custom", path: ["sponsor_ids"], message: "Assign sponsor pages only for the Sponsor role" });
  if (new Set(data.sponsor_ids).size !== data.sponsor_ids.length) context.addIssue({ code: "custom", path: ["sponsor_ids"], message: "Sponsor assignments must be unique" });
  if (data.id && data.expected_version === null) context.addIssue({ code: "custom", path: ["expected_version"], message: "Reload this user before editing permissions" });
});
export const sponsorPageSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().trim().max(3000),
  logo_url: secureUrl.refine((s) => s.length <= 2048), booth: z.string().trim().max(240),
  cta_label: z.string().trim().max(80), cta_url: secureUrl.refine((s) => s.length <= 2048),
}).strict();
export interface EventUser {
  id: string; registration_name: string; registration_email: string; user_id: string | null;
  role: EventRole; status: "approved" | "pending" | "disabled"; directory_allowed: boolean;
  access_version: number; sponsor_ids: string[];
}
