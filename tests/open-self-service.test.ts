import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('open attendee self-service', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase();
    await seedSecurityFixture(db);
    await db.query('update public.event_settings set self_service_access_enabled=true where event_id=$1', [ids.event]);
  });
  afterAll(async () => { await db?.close(); });

  it('lets a verified unknown email join only as an approved private Member', async () => {
    const claimed = await asUser(db, ids.outsider, () => db.query<{ id: string }>('select public.claim_attendee($1) as id', [ids.event]));
    const id = claimed.rows[0].id;
    expect(id).toBeTruthy();
    const attendee = (await db.query<{ access_role: string; status: string; user_id: string; registration_email: string }>(
      'select access_role,status,user_id,registration_email from public.attendees where id=$1', [id]
    )).rows[0];
    expect(attendee).toEqual({ access_role: 'member', status: 'approved', user_id: ids.outsider, registration_email: 'outsider@example.test' });
    const profile = (await db.query<{ directory_visible: boolean; messaging_available: boolean }>(
      'select directory_visible,messaging_available from public.attendee_profiles where attendee_id=$1', [id]
    )).rows[0];
    expect(profile).toEqual({ directory_visible: false, messaging_available: false });
  });

  it('keeps an explicitly disabled self-service account blocked', async () => {
    await asUser(db, ids.admin, () => db.query("update public.attendees set status='disabled' where event_id=$1 and registration_email='outsider@example.test'", [ids.event]));
    const result = await asUser(db, ids.outsider, () => db.query<{ id: string | null }>('select public.claim_attendee($1) as id', [ids.event]));
    expect(result.rows[0].id).toBeNull();
  });
});
