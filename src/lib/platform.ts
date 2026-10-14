import { z } from 'zod';
import { adminResources, type AdminResource } from './admin-resources';
import { secureUrl, uuid } from './validation';
import type { EventInfo } from './types';

export interface Organization { id: string; slug: string; name: string; status: 'active' | 'suspended'; event_limit: number | null; billing_event_limit?: number | null; version: number; created_at: string }
export interface OrganizationMember { organization_id: string; user_id: string; role: 'owner' | 'admin'; status: 'active' | 'disabled'; version: number }
export interface WorkspaceTeamMember extends OrganizationMember { email: string }
export interface OrganizationInvitation { id: string; organization_id: string; email: string; role: 'owner' | 'admin'; expires_at: string; accepted_by: string | null; revoked_at: string | null }
export interface PlatformEvent extends EventInfo { organization_id: string; organization_slug: string; platform_version: number; brand_logo_url: string }
export interface WorkspaceHome { user: { id: string; email: string }; agency: boolean; organizations: Organization[]; memberships: OrganizationMember[]; invitations: OrganizationInvitation[] }
export interface WorkspaceData { organization: Organization; events: PlatformEvent[]; owner: boolean; agency: boolean; members: WorkspaceTeamMember[]; invitations: OrganizationInvitation[] }
export interface AgencyData { organizations: Organization[]; events: PlatformEvent[]; invitations: OrganizationInvitation[]; legacyEvents: Pick<EventInfo, 'id' | 'slug' | 'name' | 'published'>[] }
export type ContentRow = Record<string, unknown>;
export type ContentLookups = Record<string, { id: string; label: string; day_id?: string; published?: boolean }[]>;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, 'Use 3–64 lowercase letters, numbers or hyphens.');
const version = z.number().int().nonnegative();
export const organizationCreateSchema = z.object({ request_id: uuid, name: z.string().trim().min(1).max(160), slug, owner_email: z.email().max(254), event_limit: z.number().int().min(1).max(10000).nullable() }).strict();
export const organizationUpdateSchema = z.object({ name: z.string().trim().min(1).max(160), version, status: z.enum(['active', 'suspended']).optional(), event_limit: z.number().int().min(1).max(10000).nullable().optional() }).strict();
export const invitationSchema = z.object({ email: z.email().max(254), role: z.enum(['owner', 'admin']) }).strict();
export const invitationAcceptSchema = z.object({ invitation_id: uuid }).strict();
export const memberUpdateSchema = z.object({ user_id: uuid, role: z.enum(['owner', 'admin']), status: z.enum(['active', 'disabled']), version }).strict();
export const idSchema = z.object({ id: uuid }).strict();
export const publishSchema = z.object({ version, published: z.boolean() }).strict();
export const emptySchema = z.object({}).strict();
const timezone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid timezone, for example America/Chicago.');
const eventFields = { name: z.string().trim().min(1).max(160), tagline: z.string().trim().max(600), timezone, start_date: z.iso.date().nullable(), end_date: z.iso.date().nullable(), brand_logo_url: secureUrl };
function orderedDates(value: { start_date: string | null; end_date: string | null }) { return !value.start_date || !value.end_date || value.end_date >= value.start_date; }
export const eventDetailsSchema = z.object(eventFields).strict().refine(orderedDates, { path: ['end_date'], message: 'The last date must be on or after the first date.' });
export const eventCreateSchema = z.object({ request_id: uuid, values: z.object({ ...eventFields, slug }).strict().refine(orderedDates, { path: ['end_date'], message: 'The last date must be on or after the first date.' }) }).strict();
export const eventUpdateSchema = z.object({ version, values: eventDetailsSchema }).strict();

// Public-guide content first. Existing Momentum Builder community settings are
// deliberately absent, so customer guide edits cannot enable/disable that hub.
const contentKeys = ['event_settings', 'agenda_days', 'agenda_sessions', 'speakers', 'sponsor_tiers', 'sponsors', 'agenda_sponsor_placements', 'venue_locations', 'lunch_locations', 'event_activities'] as const;
export const platformResources: Record<string, AdminResource> = Object.fromEntries(contentKeys.map(key => {
  const original = adminResources[key];
  const fields = original.fields.filter(field => key !== 'event_settings' || !['directory_enabled', 'messaging_enabled', 'community_enabled', 'feed_enabled', 'self_service_access_enabled'].includes(field.key));
  return [key, { ...original, fields: fields.map(field => ({ ...field, label: field.label.replace(/Impact Partners/g, 'Sponsors'), ...(field.key === 'sponsor_page_title' ? { initial: 'Sponsors' } : {}) })), ...(key === 'event_activities' ? { title: 'Activities', description: 'Add networking, activities and other experiences around your agenda.' } : {}), ...(key === 'event_settings' ? { title: 'Welcome & practical details', description: 'Set your welcome message, support information and venue essentials.' } : {}) }];
}));
export function platformResource(key: string): AdminResource | null { return Object.hasOwn(platformResources, key) ? platformResources[key] : null; }
export function workspaceEventPath(organizationSlug: string, eventId: string) { return `/app/${encodeURIComponent(organizationSlug)}/events/${encodeURIComponent(eventId)}`; }
export function publicEventPath(event: Pick<PlatformEvent, 'organization_slug' | 'slug'>) { return `/e/${encodeURIComponent(event.organization_slug)}/${encodeURIComponent(event.slug)}`; }
export function eventDetailValues(event: PlatformEvent) { return { name: event.name, tagline: event.tagline, timezone: event.timezone, start_date: event.start_date, end_date: event.end_date, brand_logo_url: event.brand_logo_url }; }
