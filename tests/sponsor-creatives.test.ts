import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('sponsor creative database boundaries', () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase(); await seedSecurityFixture(db); });
  afterAll(async () => { await db.close(); });
  it('saves and reloads an organizer image placement with existing event authorization', async () => {
    const result = await asUser(db, ids.admin, () => db.query<{ id: string }>(`insert into public.agenda_sponsor_placements(event_id,day_id,sponsor_id,headline,image_url,image_alt,image_format,surface,published) values($1,null,$2,'Approved creative','https://assets.example/ad.webp','An accessible description','square','home',true) returning id`, [ids.event, ids.sponsor]));
    const publicRow = await asUser(db, null, () => db.query('select image_url,image_alt,image_format,surface from public.agenda_sponsor_placements where id=$1', [result.rows[0].id]));
    expect(publicRow.rows).toEqual([{ image_url: 'https://assets.example/ad.webp', image_alt: 'An accessible description', image_format: 'square', surface: 'home' }]);
  });
  it('does not expose draft creatives to anonymous visitors or members', async () => {
    const result = await asUser(db, ids.admin, () => db.query<{ id: string }>(`insert into public.agenda_sponsor_placements(event_id,day_id,sponsor_id,surface,image_url) values($1,null,$2,'sponsors','https://assets.example/draft.webp') returning id`, [ids.event, ids.sponsor]));
    for (const user of [null, ids.alice]) expect((await asUser(db, user, () => db.query('select id from public.agenda_sponsor_placements where id=$1', [result.rows[0].id]))).rows).toHaveLength(0);
  });
  it('rejects anonymous and member ad creation', async () => {
    for (const user of [null, ids.alice]) await expect(asUser(db, user, () => db.query(`insert into public.agenda_sponsor_placements(event_id,day_id,sponsor_id,surface) values($1,null,$2,'home')`, [ids.event, ids.sponsor]))).rejects.toThrow();
  });
  it('refuses unsafe links, invalid shapes, cross-event references and wrong-day anchors', async () => {
    for (const [surface, day, after, event, url, shape] of [
      ['home', null, null, ids.event, 'javascript:bad', 'square'], ['home', null, null, ids.event, '', 'cropped'], ['home', null, null, ids.otherEvent, '', 'banner'],
      ['agenda', ids.otherDay, ids.session, ids.event, '', 'banner'], ['agenda', null, null, ids.event, '', 'banner'], ['home', ids.day, null, ids.event, '', 'square'],
    ]) await expect(db.query('insert into public.agenda_sponsor_placements(event_id,day_id,after_session_id,sponsor_id,surface,image_url,image_format) values($1,$2,$3,$4,$5,$6,$7)', [event, day, after, ids.sponsor, surface, url, shape])).rejects.toThrow();
  });
});
