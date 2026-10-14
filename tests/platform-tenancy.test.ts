import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

let db: PGlite;
let alpha: string;
let beta: string;
let alphaEvent: string;
let betaEvent: string;
const request = (suffix: number) => `a0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const values = (slug: string) => ({ name: slug, slug, tagline: 'Our event', timezone: 'America/Chicago', start_date: '2027-04-02', end_date: '2027-04-03', brand_logo_url: '' });
async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  return Object.values(result.rows[0])[0];
}
async function createOrg(name: string, email: string, suffix: number, limit: number | null = null) {
  return asUser(db, ids.admin, () => scalar('select public.platform_create_organization($1,$2,$3,$4,$5)', [request(suffix), name, name, email, limit]));
}
async function accept(org: string, user: string) {
  const invite = await scalar('select id from public.organization_invitations where organization_id=$1 and accepted_by is null and revoked_at is null', [org]);
  await asUser(db, user, () => scalar('select public.platform_accept_invitation($1)', [invite]));
  return invite;
}

describe('agency and organization ownership against actual migrations', () => {
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    // Fixture-only bootstrap: application roles have no grant to this table.
    await db.query('insert into private.platform_owner(user_id) values($1)', [ids.admin]);
    alpha = await createOrg('alpha-events', 'alice@example.test', 1, 3);
    beta = await createOrg('beta-events', 'bob@example.test', 2);
    await accept(alpha, ids.alice);
    await accept(beta, ids.bob);
    alphaEvent = await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [alpha, request(3), values('alpha-summit')]));
    betaEvent = await asUser(db, ids.bob, () => scalar('select public.platform_create_event($1,$2,$3)', [beta, request(4), values('beta-summit')]));
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it('reserves agency access for the explicitly assigned verified platform owner', async () => {
    expect(await asUser(db, ids.admin, () => scalar<boolean>('select public.platform_access()'))).toBe(true);
    for (const user of [ids.alice, ids.bob, ids.outsider, ids.unverified]) {
      expect(await asUser(db, user, () => scalar<boolean>('select public.platform_access()'))).toBe(false);
      await expect(asUser(db, user, () => scalar('select public.platform_create_organization($1,$2,$3,$4,null)', [request(100), 'Forged', 'forged', 'alice@example.test']))).rejects.toThrow(/Agency access/);
    }
    await expect(asUser(db, null, () => scalar('select public.platform_access()'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.alice, () => db.query('insert into private.platform_owner(user_id) values($1)', [ids.alice]))).rejects.toThrow(/permission denied/);
    await expect(db.query('insert into private.platform_owner(user_id) values($1)', [ids.alice])).rejects.toThrow(/duplicate key/);
  });

  it('creates accounts and events exactly once and rejects mismatched retry payloads', async () => {
    expect(await createOrg('alpha-events', 'alice@example.test', 1, 3)).toBe(alpha);
    await expect(createOrg('different-name', 'alice@example.test', 1, 3)).rejects.toThrow(/different details/);
    expect(await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [alpha, request(3), values('alpha-summit')]))).toBe(alphaEvent);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [alpha, request(3), values('changed-summit')]))).rejects.toThrow(/different details/);
    expect(await scalar<number>('select count(*)::int from public.events where organization_id=$1', [alpha])).toBe(1);
  });

  it('does not create attendee records or community participation for organization staff', async () => {
    expect(await scalar<number>('select count(*)::int from public.attendees where event_id=$1', [alphaEvent])).toBe(0);
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [alphaEvent]))).toBe(true);
    expect(await asUser(db, ids.alice, () => scalar('select public.current_attendee($1)', [alphaEvent]))).toBeNull();
    const settings = await db.query('select directory_enabled,messaging_enabled,community_enabled,feed_enabled,self_service_access_enabled from public.event_settings where event_id=$1', [alphaEvent]);
    expect(Object.values(settings.rows[0])).toEqual([false, false, false, false, false]);
  });

  it('isolates private organizations, invitations, draft events and event content', async () => {
    const seen = await asUser(db, ids.alice, () => db.query<{ id: string }>('select id from public.organizations'));
    expect(seen.rows.map(row => row.id)).toEqual([alpha]);
    expect((await asUser(db, ids.alice, () => db.query('select * from public.events where id=$1', [betaEvent]))).rows).toHaveLength(0);
    expect((await asUser(db, ids.alice, () => db.query('select * from public.organization_memberships where organization_id=$1', [beta]))).rows).toHaveLength(0);
    expect((await asUser(db, ids.alice, () => db.query('select * from public.organization_invitations where organization_id=$1', [beta]))).rows).toHaveLength(0);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [beta, request(5), values('forged-event')]))).rejects.toThrow(/Workspace access/);
    await expect(asUser(db, ids.alice, () => db.query('insert into public.speakers(event_id,full_name) values($1,$2)', [betaEvent, 'Wrong customer']))).rejects.toThrow(/row-level security/);
    await asUser(db, ids.alice, () => db.query('insert into public.speakers(event_id,full_name) values($1,$2)', [alphaEvent, 'Our speaker']));
  });

  it('refuses direct ownership, membership and publication changes through the Data API', async () => {
    await expect(asUser(db, ids.alice, () => db.query('update public.events set organization_id=$1,organization_slug=$2 where id=$3', [beta, 'beta-events', alphaEvent]))).rejects.toThrow(/workspace event actions/);
    await expect(asUser(db, ids.alice, () => db.query('update public.events set published=true where id=$1', [alphaEvent]))).rejects.toThrow(/workspace event actions/);
    await expect(asUser(db, ids.alice, () => db.query("update public.organization_memberships set role='owner' where organization_id=$1", [beta]))).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.events set organization_slug='beta-events' where id=$1", [alphaEvent])).rejects.toThrow(/foreign key/);
  });

  it('binds invitations to the verified intended identity and supports safe acceptance retries', async () => {
    const invitation = await asUser(db, ids.alice, () => scalar('select public.platform_invite_member($1,$2,$3)', [alpha, 'outsider@example.test', 'admin']));
    await expect(asUser(db, ids.bob, () => scalar('select public.platform_accept_invitation($1)', [invitation]))).rejects.toThrow(/not available/);
    await expect(asUser(db, ids.unverified, () => scalar('select public.platform_accept_invitation($1)', [invitation]))).rejects.toThrow(/Verify your email/);
    expect(await asUser(db, ids.outsider, () => scalar('select public.platform_accept_invitation($1)', [invitation]))).toBe(alpha);
    expect(await asUser(db, ids.outsider, () => scalar('select public.platform_accept_invitation($1)', [invitation]))).toBe(alpha);
    await expect(asUser(db, ids.outsider, () => scalar('select public.platform_invite_member($1,$2,$3)', [alpha, 'bob@example.test', 'owner']))).rejects.toThrow(/owner access/);
    await asUser(db, ids.alice, () => scalar('select public.platform_update_member($1,$2,$3,$4,$5)', [alpha, ids.outsider, 'admin', 'disabled', 0]));
    expect(await asUser(db, ids.outsider, () => scalar<boolean>('select public.is_event_admin($1)', [alphaEvent]))).toBe(false);
    // Replaying an accepted invitation must not reactivate a revoked member.
    await asUser(db, ids.outsider, () => scalar('select public.platform_accept_invitation($1)', [invitation]));
    expect(await asUser(db, ids.outsider, () => scalar<boolean>('select public.platform_can_manage_organization($1)', [alpha]))).toBe(false);
  });

  it('rejects expired and revoked invitations', async () => {
    const revoked = await asUser(db, ids.alice, () => scalar('select public.platform_invite_member($1,$2,$3)', [alpha, 'bob@example.test', 'admin']));
    await asUser(db, ids.alice, () => scalar('select public.platform_revoke_invitation($1,$2)', [alpha, revoked]));
    await expect(asUser(db, ids.bob, () => scalar('select public.platform_accept_invitation($1)', [revoked]))).rejects.toThrow(/expired or was revoked/);
    const expired = await asUser(db, ids.alice, () => scalar('select public.platform_invite_member($1,$2,$3)', [alpha, 'bob@example.test', 'admin']));
    await db.query("update public.organization_invitations set expires_at=now()-interval '1 minute' where id=$1", [expired]);
    await expect(asUser(db, ids.bob, () => scalar('select public.platform_accept_invitation($1)', [expired]))).rejects.toThrow(/expired or was revoked/);
  });

  it('keeps one active owner and rejects stale member/settings changes', async () => {
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_update_member($1,$2,$3,$4,$5)', [alpha, ids.alice, 'admin', 'active', 0]))).rejects.toThrow(/at least one active workspace owner/);
    await expect(asUser(db, ids.admin, () => scalar('select public.platform_update_member($1,$2,$3,$4,$5)', [alpha, ids.alice, 'owner', 'disabled', 0]))).rejects.toThrow(/at least one active workspace owner/);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_update_member($1,$2,$3,$4,$5)', [alpha, ids.outsider, 'admin', 'active', 0]))).rejects.toThrow(/Team access changed/);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_update_organization($1,$2,$3,$4,$5,$6)', [alpha, 'Alpha', 0, null, 100, true]))).rejects.toThrow(/Agency access/);
  });

  it('requires scoped event identity and version when saving and publishing', async () => {
    const { slug: _slug, ...details } = values('alpha-summit');
    void _slug;
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_update_event($1,$2,$3,$4)', [alpha, betaEvent, 0, details]))).rejects.toThrow(/not in your workspace/);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_update_event($1,$2,$3,$4)', [alpha, alphaEvent, 0, { ...details, published: true }]))).rejects.toThrow(/Unsupported event field/);
    await asUser(db, ids.alice, () => scalar('select public.platform_update_event($1,$2,$3,$4)', [alpha, alphaEvent, 0, { ...details, name: 'Alpha refreshed' }]));
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_publish_event($1,$2,$3,$4)', [alpha, alphaEvent, 0, true]))).rejects.toThrow(/changed/);
    await asUser(db, ids.alice, () => scalar('select public.platform_publish_event($1,$2,$3,$4)', [alpha, alphaEvent, 1, true]));
    expect((await asUser(db, null, () => db.query('select name from public.events where id=$1', [alphaEvent]))).rows).toEqual([{ name: 'Alpha refreshed' }]);
    expect((await asUser(db, null, () => db.query('select id from public.events where id=$1', [betaEvent]))).rows).toHaveLength(0);
  });

  it('enforces event limits under the same transaction lock as creation', async () => {
    const limited = await createOrg('limited-events', 'alice@example.test', 20, 1);
    await accept(limited, ids.alice);
    const event = await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [limited, request(21), values('only-event')]));
    expect(await asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [limited, request(21), values('only-event')]))).toBe(event);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_create_event($1,$2,$3)', [limited, request(22), values('too-many')]))).rejects.toThrow(/event limit/);
    expect(await scalar<number>('select count(*)::int from public.events where organization_id=$1', [limited])).toBe(1);
  });

  it('preserves legacy event identities and registrations during explicit agency adoption', async () => {
    const before = await scalar<number>('select count(*)::int from public.attendees where event_id=$1', [ids.event]);
    await expect(asUser(db, ids.alice, () => scalar('select public.platform_adopt_event($1,$2)', [alpha, ids.event]))).rejects.toThrow(/Agency access/);
    await asUser(db, ids.admin, () => scalar('select public.platform_adopt_event($1,$2)', [alpha, ids.event]));
    expect(await scalar('select id from public.events where slug=$1', ['security-test'])).toBe(ids.event);
    expect(await scalar<number>('select count(*)::int from public.attendees where event_id=$1', [ids.event])).toBe(before);
    expect(await asUser(db, ids.admin, () => scalar<boolean>('select public.is_event_admin($1)', [ids.event]))).toBe(true);
    await expect(asUser(db, ids.admin, () => scalar('select public.platform_adopt_event($1,$2)', [beta, ids.event]))).rejects.toThrow(/already belongs/);
  });

  it('suspends customer management immediately while retaining agency recovery and audit', async () => {
    await asUser(db, ids.admin, () => scalar('select public.platform_support_open($1)', [alpha]));
    await asUser(db, ids.admin, () => scalar('select public.platform_update_organization($1,$2,$3,$4)', [alpha, 'Alpha', 0, 'suspended']));
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [alphaEvent]))).toBe(false);
    expect(await asUser(db, ids.admin, () => scalar<boolean>('select public.is_event_admin($1)', [alphaEvent]))).toBe(true);
    expect((await asUser(db, ids.admin, () => db.query("select actor_id from public.platform_audit_log where organization_id=$1 and action='support.workspace_opened'", [alpha]))).rows).toEqual([{ actor_id: ids.admin }]);
    expect((await asUser(db, ids.bob, () => db.query('select * from public.platform_audit_log where organization_id=$1', [alpha]))).rows).toHaveLength(0);
    await asUser(db, ids.admin, () => scalar('select public.platform_update_organization($1,$2,$3,$4)', [alpha, 'Alpha', 1, 'active']));
    expect(await asUser(db, ids.alice, () => scalar<boolean>('select public.is_event_admin($1)', [alphaEvent]))).toBe(true);
  });
});
