import 'server-only';
import { serverSupabase } from '../supabase/server';
import type { Organization, PlatformEvent } from '../platform';
import { ApiError, databaseError } from './http';

export function platformEnabled() { return process.env.EVENT_BEAST_PLATFORM_ENABLED === 'true'; }
export async function platformIdentity() {
  if (!platformEnabled()) throw new ApiError(404, 'The workspace is not available.');
  if (process.env.EVENT_BEAST_DEMO_MODE === 'true') throw new ApiError(409, 'This preview does not connect customer accounts.');
  const db = await serverSupabase();
  if (!db) throw new ApiError(503, 'Workspace sign-in is being configured.');
  const identity = await db.auth.getUser();
  if (identity.error || !identity.data.user) throw new ApiError(401, 'Sign in to open your workspace.');
  const user = identity.data.user;
  if (!user.email_confirmed_at || !user.email) throw new ApiError(403, 'Verify your email before opening a workspace.');
  const permission = await db.rpc('platform_access');
  databaseError(permission.error);
  return { db, user, agency: permission.data === true };
}
export type PlatformActor = Awaited<ReturnType<typeof platformIdentity>>;
export function requireAgency(actor: PlatformActor) {
  if (!actor.agency) throw new ApiError(403, 'Agency access is required.');
  return actor;
}
export async function platformOrganization(actor: PlatformActor, slug: string) {
  const result = await actor.db.from('organizations').select('*').eq('slug', slug).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, 'This workspace is not available to your account.');
  const organization = result.data as Organization;
  const access = await actor.db.rpc('platform_can_manage_organization', { p_organization: organization.id });
  databaseError(access.error);
  if (!access.data) throw new ApiError(403, organization.status === 'suspended' ? 'This workspace is suspended. Contact Event Beast support.' : 'Workspace editing is unavailable. Review Billing for subscription recovery, or ask the owner to check your access.');
  return { ...actor, organization };
}
export async function platformEvent(actor: PlatformActor, organizationSlug: string, eventId: string) {
  const scope = await platformOrganization(actor, organizationSlug);
  const result = await actor.db.from('events').select('*').eq('organization_id', scope.organization.id).eq('id', eventId).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, 'This event is not in your workspace.');
  return { ...scope, event: result.data as PlatformEvent };
}
