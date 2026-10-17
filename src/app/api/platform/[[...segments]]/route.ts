import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { organizationCreateSchema, organizationUpdateSchema, invitationSchema, invitationAcceptSchema, memberUpdateSchema, idSchema, publishSchema, emptySchema, eventCreateSchema, eventUpdateSchema, platformResource, publicEventPath, type PlatformEvent } from '@/lib/platform';
import { uuid } from '@/lib/validation';
import { platformIdentity, platformOrganization, platformEvent, requireAgency, type PlatformActor } from '@/lib/server/platform-auth';
import { ApiError, databaseError, handle, json, parseBody, assertSameOrigin } from '@/lib/server/http';
import { contentActions } from '@/lib/server/content-actions';
import { invalidatePublicGuide } from '@/lib/server/guide';
import { saveEventImage } from '@/lib/server/image-upload';
import { getEventSetup } from '@/lib/server/event-setup';

type Context = { params: Promise<{ segments?: string[] }> };
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
async function rpc(actor: PlatformActor, name: string, args: Record<string, unknown>) {
  const result = await actor.db.rpc(name, args);
  databaseError(result.error);
  return result.data;
}
function invalidate(event: PlatformEvent) {
  revalidatePath(publicEventPath(event));
  // An explicitly adopted legacy event may also have an existing host alias.
  invalidatePublicGuide();
}
async function run(request: Request, context: Context, method: Method): Promise<Response> {
  const { segments = [] } = await context.params;
  const actor = await platformIdentity();
  const { db } = actor;
  if (!segments.length && method === 'GET') {
    const [organizations, memberships, invitations] = await Promise.all([
      db.from('organizations').select('*').order('created_at', { ascending: false }).limit(200),
      db.from('organization_memberships').select('*').eq('user_id', actor.user.id).eq('status', 'active'),
      db.from('organization_invitations').select('*').eq('email', actor.user.email!.trim().toLowerCase()).is('accepted_by', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()),
    ]);
    [organizations, memberships, invitations].forEach(result => databaseError(result.error));
    return json({ user: { id: actor.user.id, email: actor.user.email }, agency: actor.agency, organizations: organizations.data, memberships: memberships.data, invitations: invitations.data });
  }
  if (segments.length === 1 && segments[0] === 'accept-invitation' && method === 'POST') {
    const body = await parseBody(request, invitationAcceptSchema);
    return json({ organization_id: await rpc(actor, 'platform_accept_invitation', { p_invitation: body.invitation_id }) });
  }
  if (segments.length === 1 && segments[0] === 'agency') {
    requireAgency(actor);
    if (method === 'GET') {
      const [organizations, events, invitations, legacyEvents] = await Promise.all([
        db.from('organizations').select('*').order('created_at', { ascending: false }).limit(200),
        db.from('events').select('id,organization_id,organization_slug,name,slug,published,start_date,end_date,timezone').not('organization_id', 'is', null).order('created_at', { ascending: false }).limit(1000),
        db.from('organization_invitations').select('*').eq('role', 'owner').is('accepted_by', null).is('revoked_at', null).limit(500),
        db.rpc('platform_legacy_events'),
      ]);
      [organizations, events, invitations, legacyEvents].forEach(result => databaseError(result.error));
      return json({ organizations: organizations.data, events: events.data, invitations: invitations.data, legacyEvents: legacyEvents.data });
    }
    if (method === 'POST') {
      const body = await parseBody(request, organizationCreateSchema);
      const id = await rpc(actor, 'platform_create_organization', { p_request: body.request_id, p_name: body.name, p_slug: body.slug, p_owner_email: body.owner_email, p_event_limit: body.event_limit });
      return json({ id, slug: body.slug }, 201);
    }
  }
  if (segments[0] !== 'organizations' || !segments[1]) throw new ApiError(404, 'This workspace action does not exist.');
  const scope = await platformOrganization(actor, segments[1]);
  const org = scope.organization;
  if (segments.length === 2) {
    if (method === 'GET') {
      const owner = await rpc(actor, 'platform_owns_organization', { p_organization: org.id }) === true;
      if (actor.agency) await rpc(actor, 'platform_support_open', { p_organization: org.id });
      const events = await db.from('events').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(200);
      databaseError(events.error);
      const [members, invitations] = owner ? await Promise.all([
        db.rpc('platform_team_members', { p_organization: org.id }),
        db.from('organization_invitations').select('*').eq('organization_id', org.id).is('accepted_by', null).is('revoked_at', null).order('created_at', { ascending: false }).limit(200),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      databaseError(members.error); databaseError(invitations.error);
      return json({ organization: org, events: events.data, owner, agency: actor.agency, members: members.data, invitations: invitations.data });
    }
    if (method === 'PATCH') {
      const body = await parseBody(request, organizationUpdateSchema);
      await rpc(actor, 'platform_update_organization', { p_organization: org.id, p_name: body.name, p_version: body.version, p_status: body.status ?? null, p_event_limit: body.event_limit ?? null, p_set_limit: Object.hasOwn(body, 'event_limit') });
      return json({ saved: true });
    }
  }
  if (segments.length === 3 && segments[2] === 'invitations') {
    if (method === 'POST') {
      const body = await parseBody(request, invitationSchema);
      return json({ id: await rpc(actor, 'platform_invite_member', { p_organization: org.id, p_email: body.email, p_role: body.role }) }, 201);
    }
    if (method === 'DELETE') {
      const body = await parseBody(request, idSchema);
      await rpc(actor, 'platform_revoke_invitation', { p_organization: org.id, p_invitation: body.id });
      return json({ revoked: true });
    }
  }
  if (segments.length === 3 && segments[2] === 'members' && method === 'PATCH') {
    const body = await parseBody(request, memberUpdateSchema);
    await rpc(actor, 'platform_update_member', { p_organization: org.id, p_user: body.user_id, p_role: body.role, p_status: body.status, p_version: body.version });
    return json({ saved: true });
  }
  if (segments.length === 3 && segments[2] === 'adopt-event' && method === 'POST') {
    requireAgency(actor);
    const body = await parseBody(request, idSchema);
    await rpc(actor, 'platform_adopt_event', { p_organization: org.id, p_event: body.id });
    invalidatePublicGuide();
    return json({ saved: true });
  }
  if (segments.length === 3 && segments[2] === 'support-open' && method === 'POST') {
    requireAgency(actor);
    await parseBody(request, emptySchema);
    await rpc(actor, 'platform_support_open', { p_organization: org.id });
    return json({ opened: true });
  }
  if (segments[2] !== 'events') throw new ApiError(404, 'This workspace action does not exist.');
  if (segments.length === 3 && method === 'POST') {
    const body = await parseBody(request, eventCreateSchema);
    return json({ id: await rpc(actor, 'platform_create_event', { p_organization: org.id, p_request: body.request_id, p_values: body.values }) }, 201);
  }
  if (!segments[3]) throw new ApiError(404, 'Choose an event.');
  const eventActor = await platformEvent(actor, org.slug, uuid.parse(segments[3]));
  const { event } = eventActor;
  if (segments.length === 4) {
    if (method === 'GET') return json({ event, organization: org, agency: actor.agency });
    if (method === 'PATCH') {
      const body = await parseBody(request, eventUpdateSchema);
      await rpc(actor, 'platform_update_event', { p_organization: org.id, p_event: event.id, p_version: body.version, p_values: body.values });
      invalidate(event);
      return json({ saved: true });
    }
  }
  if (segments.length === 5 && segments[4] === 'setup' && method === 'GET') {
    return json(await getEventSetup(eventActor));
  }
  if (segments.length === 5 && segments[4] === 'publish' && method === 'POST') {
    const body = await parseBody(request, publishSchema);
    await rpc(actor, 'platform_publish_event', { p_organization: org.id, p_event: event.id, p_version: body.version, p_published: body.published });
    invalidate(event);
    return json({ saved: true });
  }
  if (segments.length === 5 && segments[4] === 'lookups' && method === 'GET') {
    const tables = { agenda_days: 'label', agenda_sessions: 'title', speakers: 'full_name', sponsors: 'name', sponsor_tiers: 'name' };
    const entries = await Promise.all(Object.entries(tables).map(async ([table, label]) => {
      const columns = `id,${label}${table === 'agenda_sessions' ? ',day_id' : ''}${table === 'speakers' ? ',published' : ''}`;
      const rows = await db.from(table).select(columns).eq('event_id', event.id).order(label).limit(1000);
      databaseError(rows.error);
      return [table, (rows.data as unknown as Record<string, unknown>[] ?? []).map(row => ({ id: row.id, label: row[label], day_id: row.day_id, published: row.published }))];
    }));
    return json(Object.fromEntries(entries));
  }
  if (segments.length === 5 && segments[4] === 'uploads' && method === 'POST') {
    assertSameOrigin(request);
    if (Number(request.headers.get('content-length') ?? 0) > 3.5 * 1024 * 1024) throw new ApiError(413, 'Choose a JPG, PNG or WebP under 3 MB.');
    const form = await request.formData();
    if ([...form.keys()].some(key => key !== 'file')) throw new ApiError(400, 'Upload only the image file.');
    return json(await saveEventImage(db, event.id, 'organizer', form.get('file')));
  }
  if (segments.length === 6 && segments[4] === 'content') {
    const resource = z.string().min(1).max(80).parse(segments[5]);
    const actions = contentActions({ authorize: async () => eventActor, invalidate: () => invalidate(event), definition: platformResource, updateSingleton: true });
    return actions[method](request, { params: Promise.resolve({ resource }) });
  }
  throw new ApiError(404, 'This workspace action does not exist.');
}
export const GET = (request: Request, context: Context) => handle(() => run(request, context, 'GET'));
export const POST = (request: Request, context: Context) => handle(() => run(request, context, 'POST'));
export const PATCH = (request: Request, context: Context) => handle(() => run(request, context, 'PATCH'));
export const DELETE = (request: Request, context: Context) => handle(() => run(request, context, 'DELETE'));
