import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('organizer storage uses the current event Admin role', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    await db.query("update public.attendees set access_role='admin' where id=$1", [ids.aliceAttendee]);
  });
  afterAll(async () => { await db.close(); });
  it('permits a verified claimed roster Admin without a legacy event_admins row', async () => {
    const result = await asUser(db, ids.alice, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1) returning name", [`${ids.event}/organizer/new.webp`]));
    expect(result.rows).toEqual([{ name: `${ids.event}/organizer/new.webp` }]);
    await asUser(db, ids.alice, () => db.query("delete from storage.objects where name=$1", [`${ids.event}/organizer/new.webp`]));
  });
  it('preserves legacy owner uploads and refuses cross-event access', async () => {
    await asUser(db, ids.admin, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1)", [`${ids.event}/organizer/owner.webp`]));
    await expect(asUser(db, ids.alice, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1)", [`${ids.otherEvent}/organizer/wrong.webp`]))).rejects.toThrow();
  });
  it('refuses Members, Sponsors, unverified users and disabled Admins', async () => {
    for (const user of [ids.bob, ids.outsider, ids.unverified]) await expect(asUser(db, user, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1)", [`${ids.event}/organizer/denied.webp`]))).rejects.toThrow();
    await db.query("update public.attendees set access_role='sponsor' where id=$1", [ids.bobAttendee]);
    await expect(asUser(db, ids.bob, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1)", [`${ids.event}/organizer/sponsor.webp`]))).rejects.toThrow();
    await db.query("update public.attendees set status='disabled' where id=$1", [ids.aliceAttendee]);
    try { await expect(asUser(db, ids.alice, () => db.query("insert into storage.objects(bucket_id,name) values('event-assets',$1)", [`${ids.event}/organizer/disabled.webp`]))).rejects.toThrow(); }
    finally { await db.query("update public.attendees set status='approved' where id=$1", [ids.aliceAttendee]); }
  });
  it('does not grant helper execution to anonymous users', async () => {
    const row = await db.query("select has_function_privilege('anon','public.can_write_event_asset(text)','EXECUTE') as allowed");
    expect(row.rows).toEqual([{ allowed: false }]);
  });
});
