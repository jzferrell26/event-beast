import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';
import { directoryProfile, PROFILE_SELECT } from '../src/lib/profile-fields';
import { demoProfiles } from '../src/lib/demo';
import { profileSchema, parseAttendeeCsv } from '../src/lib/validation';

let db: PGlite;
beforeAll(async () => {
  db = await createDatabase(); await seedSecurityFixture(db);
  await db.query("update public.attendee_profiles set directory_visible = true, messaging_available = true");
  await db.query("update public.attendees set access_role='sponsor' where id=$1", [ids.bobAttendee]);
  await db.query("insert into public.attendee_contacts(event_id,attendee_id,contact_email,phone,website) values($1,$2,'private@example.test','555-321-4321','https://private.example.test')", [ids.event, ids.aliceAttendee]);
});
afterAll(async () => { await db?.close(); });

describe('Admin-only attendee contacts', () => {
  it('keeps emails, phones and websites out of raw profile records', async () => {
    for (const user of [ids.alice, ids.bob]) await asUser(db, user, async () => {
      const result = await db.query<Record<string, unknown>>('select * from public.attendee_profiles');
      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) for (const field of ['public_email', 'public_phone', 'website', 'registration_email', 'phone']) expect(row).not.toHaveProperty(field);
      expect(JSON.stringify(result.rows)).not.toContain('private@example.test');
    });
  });
  it('denies contact rows and changes to both members and sponsors, including the contact owner', async () => {
    for (const user of [ids.alice, ids.bob]) await asUser(db, user, async () => {
      expect((await db.query('select * from public.attendee_contacts')).rows).toEqual([]);
      expect((await db.query("update public.attendee_contacts set phone='spoof' returning attendee_id")).rows).toEqual([]);
      await expect(db.query("insert into public.attendee_contacts(event_id,attendee_id,phone) values($1,$2,'555')", [ids.event, ids.bobAttendee])).rejects.toThrow(/row-level security/);
    });
  });
  it('allows admins to see and maintain contacts and records the update', async () => {
    await asUser(db, ids.admin, async () => {
      const rows = await db.query<{ phone: string }>('select phone from public.attendee_contacts');
      expect(rows.rows[0].phone).toBe('555-321-4321');
      await db.query("update public.attendee_contacts set phone='555-321-4322' where attendee_id=$1", [ids.aliceAttendee]);
      expect((await db.query("select id from public.audit_log where action='attendee_contacts.update'")).rows).toHaveLength(1);
      await expect(db.query("insert into public.attendee_contacts(event_id,attendee_id,phone) values($1,$2,'555')", [ids.otherEvent, ids.foreignAttendee])).rejects.toThrow(/row-level security/);
    });
  });
  it('imports an optional phone only into the private table', async () => {
    const csv = parseAttendeeCsv('email,name,phone\nfresh@example.test,Fresh Attendee,+1 555 222 1111');
    expect(csv.errors).toEqual([]);
    await asUser(db, ids.admin, () => db.query('select public.import_attendees($1,$2)', [ids.event, JSON.stringify(csv.rows)]));
    expect((await db.query("select phone from public.attendee_contacts where phone='+1 555 222 1111'")).rows).toHaveLength(1);
    await asUser(db, ids.bob, async () => expect((await db.query('select * from public.attendee_contacts')).rows).toEqual([]));
  });
  it('does not expose a nested private-contact join when a profile is public', async () => {
    await asUser(db, ids.bob, async () => {
      const result = await db.query<{ phone: string | null }>('select c.phone from public.attendee_profiles p left join public.attendee_contacts c on c.event_id=p.event_id and c.attendee_id=p.attendee_id');
      expect(result.rows.every(row => row.phone === null)).toBe(true);
    });
  });
  it('rejects retired public-contact properties in profile edits and strips them from response projections', () => {
    const safe = directoryProfile({ ...demoProfiles[0], public_email: 'secret@example.test', phone: '5552221111', website: 'https://secret.example.test' } as typeof demoProfiles[number]);
    expect(PROFILE_SELECT).not.toMatch(/email|phone|website/);
    expect(safe).not.toHaveProperty('public_email'); expect(safe).not.toHaveProperty('phone');
    const editable = Object.fromEntries(Object.keys(profileSchema.shape).map(key => [key, safe[key as keyof typeof safe]]));
    expect(profileSchema.safeParse(editable).success).toBe(true);
    expect(profileSchema.safeParse({ ...editable, public_email: 'secret@example.test' }).success).toBe(false);
  });
});
