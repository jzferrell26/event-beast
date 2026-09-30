import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('event feed and activities security', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    await db.query("update public.event_settings set directory_enabled=true,messaging_enabled=true where event_id=$1", [ids.event]);
    await db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=$1", [ids.event]);
  });
  afterAll(async () => { await db.close(); });

  it('keeps activities public only when published and lets Admins manage them', async () => {
    const id = (await asUser(db, ids.admin, () => db.query<{ id: string }>("insert into public.event_activities(event_id,title,published) values($1,'Morning meetup',false) returning id", [ids.event]))).rows[0].id;
    expect((await asUser(db, null, () => db.query('select id from public.event_activities where id=$1', [id]))).rows).toEqual([]);
    await asUser(db, ids.admin, () => db.query('update public.event_activities set published=true where id=$1', [id]));
    expect((await asUser(db, null, () => db.query('select title from public.event_activities where id=$1', [id]))).rows).toEqual([{ title: 'Morning meetup' }]);
    await expect(asUser(db, ids.alice, () => db.query("insert into public.event_activities(event_id,title) values($1,'Nope')", [ids.event]))).rejects.toThrow();
  });

  it('creates event-scoped feed posts and blocks cross-event reads', async () => {
    const post = (await asUser(db, ids.alice, () => db.query<{ id: string }>('select (public.create_feed_post($1,$2)).id as id', [ids.event, 'Hello Momentum']))).rows[0];
    const visible = await asUser(db, ids.bob, () => db.query('select body from public.feed_posts where id=$1', [post.id]));
    expect(visible.rows).toEqual([{ body: 'Hello Momentum' }]);
    const foreign = await asUser(db, ids.alice, () => db.query('select id from public.feed_posts where event_id=$1', [ids.otherEvent]));
    expect(foreign.rows).toEqual([]);
  });

  it('applies block relationships to feed visibility', async () => {
    const post = (await asUser(db, ids.alice, () => db.query<{ id: string }>('select (public.create_feed_post($1,$2)).id as id', [ids.event, 'Blocked feed post']))).rows[0];
    await asUser(db, ids.bob, () => db.query('select public.set_attendee_block($1,$2,true)', [ids.event, ids.aliceAttendee]));
    const result = await asUser(db, ids.bob, () => db.query('select id from public.feed_posts where id=$1', [post.id]));
    expect(result.rows).toEqual([]);
    await asUser(db, ids.bob, () => db.query('select public.set_attendee_block($1,$2,false)', [ids.event, ids.aliceAttendee]));
  });

  it('lets authors soft-delete only their own post and lets Admins hide any post', async () => {
    const post = (await asUser(db, ids.alice, () => db.query<{ id: string }>('select (public.create_feed_post($1,$2)).id as id', [ids.event, 'My post']))).rows[0];
    expect((await asUser(db, ids.bob, () => db.query("update public.feed_posts set status='deleted' where id=$1 returning id", [post.id]))).rows).toEqual([]);
    expect((await asUser(db, ids.alice, () => db.query("update public.feed_posts set status='deleted' where id=$1 returning id", [post.id]))).rows).toEqual([{ id: post.id }]);
    const another = (await asUser(db, ids.bob, () => db.query<{ id: string }>('select (public.create_feed_post($1,$2)).id as id', [ids.event, 'Moderate me']))).rows[0];
    expect((await asUser(db, ids.admin, () => db.query("update public.feed_posts set status='hidden' where id=$1 returning id", [another.id]))).rows).toEqual([{ id: another.id }]);
  });

  it('supports reporting without exposing reports to unrelated members', async () => {
    const post = (await asUser(db, ids.alice, () => db.query<{ id: string }>('select (public.create_feed_post($1,$2)).id as id', [ids.event, 'Reportable']))).rows[0];
    const report = (await asUser(db, ids.bob, () => db.query<{ id: string }>('select public.report_feed_post($1,$2,$3) as id', [ids.event, post.id, 'Please review']))).rows[0];
    expect((await asUser(db, ids.bob, () => db.query('select id from public.feed_reports where id=$1', [report.id]))).rows).toEqual([{ id: report.id }]);
    expect((await asUser(db, ids.alice, () => db.query('select id from public.feed_reports where id=$1', [report.id]))).rows).toEqual([]);
    expect((await asUser(db, ids.admin, () => db.query('select id from public.feed_reports where id=$1', [report.id]))).rows).toEqual([{ id: report.id }]);
  });
});
