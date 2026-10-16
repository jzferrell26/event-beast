import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';
let db: PGlite;
const org = 'c1000000-0000-4000-8000-000000000001';
describe('workspace team identities', () => {
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    await db.query('insert into private.platform_owner(user_id) values($1)', [ids.admin]);
    await db.query("insert into public.organizations(id,name,slug) values($1,'Team sample','team-sample')", [org]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role) values($1,$2,'owner'),($1,$3,'admin')", [org, ids.alice, ids.outsider]);
  }, 60000);
  afterAll(async () => { await db?.close(); });
  it('shows account emails only to the workspace owner and agency', async () => {
    for (const actor of [ids.alice, ids.admin]) {
      const result = await asUser(db, actor, () => db.query<{ email: string }>('select email from public.platform_team_members($1) order by email', [org]));
      expect(result.rows.map(row => row.email)).toEqual(['alice@example.test', 'outsider@example.test']);
    }
  });
  it('denies another customer, event staff, unverified users and anonymous callers', async () => {
    for (const actor of [ids.bob, ids.outsider, ids.unverified, null]) {
      await expect(asUser(db, actor, () => db.query('select * from public.platform_team_members($1)', [org]))).rejects.toMatchObject({ code: '42501' });
    }
  });
  it('never adds account email fields to attendee directory records', async () => {
    const result = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='attendee_profiles'");
    expect(result.rows.map(row => row.column_name)).not.toContain('email');
    const staff = await asUser(db, ids.alice, () => db.query<Record<string, unknown>>('select * from public.platform_team_members($1)', [org]));
    expect(staff.rows).toHaveLength(2);
    expect(Object.keys(staff.rows[0]).sort()).toEqual(['email', 'organization_id', 'role', 'status', 'user_id', 'version']);
  });
});
