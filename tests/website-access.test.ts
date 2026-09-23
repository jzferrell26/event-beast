import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';
import { sessionCookieOptions, SESSION_COOKIE_DAYS } from '../src/lib/supabase/session-options';

let db: PGlite;
let slug: string;
let requestId: string;
beforeAll(async () => { db = await createDatabase(); await seedSecurityFixture(db); slug = (await db.query<{ slug: string }>('select slug from public.events where id=$1', [ids.event])).rows[0].slug; });
afterAll(async () => { await db?.close(); });

describe('website signup access review', () => {
  it('allows only verified users to submit an access request', async () => {
    await asUser(db, null, async () => await expect(db.query("select public.request_event_access($1,'New person')", [slug])).rejects.toThrow(/permission denied/));
    await asUser(db, ids.unverified, async () => await expect(db.query("select public.request_event_access($1,'New person')", [slug])).rejects.toThrow(/Verify your email/));
  });
  it('creates a private pending Member request without granting event access', async () => {
    const first = await asUser(db, ids.outsider, () => db.query<{ id: string }>("select public.request_event_access($1,'Verified guest') as id", [slug]));
    requestId = first.rows[0].id;
    const row = (await db.query<{ status: string; access_role: string; user_id: string }>('select status,access_role,user_id from public.attendees where id=$1', [requestId])).rows[0];
    expect(row).toEqual({ status: 'pending', access_role: 'member', user_id: ids.outsider });
    await asUser(db, ids.outsider, async () => {
      expect((await db.query<{ id: string | null }>('select public.current_attendee($1) as id', [ids.event])).rows[0].id).toBeNull();
      expect((await db.query('select * from public.attendee_profiles')).rows).toEqual([]);
      expect((await db.query('select * from public.attendee_contacts')).rows).toEqual([]);
    });
  });
  it('reuses the same pending request and preserves profile consent', async () => {
    const again = await asUser(db, ids.outsider, () => db.query<{ id: string }>("select public.request_event_access($1,'Verified guest') as id", [slug]));
    expect(again.rows[0].id).toBe(requestId);
    expect((await db.query('select directory_visible,messaging_available from public.attendee_profiles where attendee_id=$1', [requestId])).rows[0]).toEqual({ directory_visible: false, messaging_available: false });
  });
  it('requires Admin approval and does not revive disabled access', async () => {
    await asUser(db, ids.admin, () => db.query("update public.attendees set status='approved' where id=$1", [requestId]));
    await asUser(db, ids.outsider, async () => expect((await db.query<{ id: string }>('select public.current_attendee($1) as id', [ids.event])).rows[0].id).toBe(requestId));
    await asUser(db, ids.admin, () => db.query("update public.attendees set status='disabled' where id=$1", [requestId]));
    await asUser(db, ids.outsider, async () => await expect(db.query("select public.request_event_access($1,'Verified guest')", [slug])).rejects.toThrow(/Contact the event team/));
  });
  it('keeps source review notes private even when the related session is public', async () => {
    await db.query("insert into public.agenda_import_notes(event_id,session_id,source_sheet,source_row,issue) values($1,$2,'Day 2',10,'Organizer review')", [ids.event, ids.session]);
    await asUser(db, ids.alice, async () => expect((await db.query('select * from public.agenda_import_notes')).rows).toEqual([]));
    await asUser(db, ids.admin, async () => expect((await db.query('select * from public.agenda_import_notes')).rows).toHaveLength(1));
  });
});

describe('persistent website sessions', () => {
  it('persists the cookie while keeping HTTPS and SameSite controls', () => {
    expect(SESSION_COOKIE_DAYS).toBe(365);
    expect(sessionCookieOptions('https://event-beast.vercel.app')).toEqual({ path: '/', sameSite: 'lax', secure: true, maxAge: 31536000 });
    expect(sessionCookieOptions('http://127.0.0.1:3101').secure).toBe(false);
  });
});
