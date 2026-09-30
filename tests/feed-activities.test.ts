import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('event social wall and Fun Stuff boundaries', () => {
  let db: PGlite;
  const publish = (user: string, body = 'A takeaway from the event', client = randomUUID(), event = ids.event) => asUser(db, user, () => db.query<{ id: string }>('select (public.publish_feed_post($1,$2,$3)).id as id', [event, client, body]));
  beforeAll(async () => { db = await createDatabase({ hostedFunctionGrants: true }); await seedSecurityFixture(db); });
  beforeEach(async () => {
    await db.query('delete from public.feed_reports'); await db.query('delete from public.feed_posts'); await db.query('delete from public.blocks');
    await db.query('update public.event_settings set community_enabled=true,feed_enabled=true,directory_enabled=true,messaging_enabled=true where event_id=$1', [ids.event]);
    await db.query("update public.attendees set status='approved' where id in ($1,$2)", [ids.aliceAttendee, ids.bobAttendee]);
  });
  afterAll(async () => { await db?.close(); });
  it('permits only published Fun Stuff for the public and organizer-only editing', async () => {
    const id = (await asUser(db, ids.admin, () => db.query<{id:string}>("insert into public.event_activities(event_id,title,published) values($1,'Synthetic meetup',false) returning id", [ids.event]))).rows[0].id;
    expect((await asUser(db, null, () => db.query('select id from public.event_activities where id=$1', [id]))).rows).toEqual([]);
    await asUser(db, ids.admin, () => db.query('update public.event_activities set published=true where id=$1', [id]));
    expect((await asUser(db, null, () => db.query('select id from public.event_activities where id=$1', [id]))).rows).toHaveLength(1);
    await expect(asUser(db, ids.alice, () => db.query("insert into public.event_activities(event_id,title) values($1,'Unauthorized')", [ids.event]))).rejects.toThrow();
  });
  it('refuses anonymous reads and old/direct write paths, including forged author/time/status', async () => {
    await expect(asUser(db, null, () => db.query('select * from public.feed_posts'))).rejects.toThrow();
    await expect(asUser(db, ids.alice, () => db.query("select public.create_feed_post($1,'Bypass')", [ids.event]))).rejects.toThrow();
    await expect(asUser(db, ids.alice, () => db.query("insert into public.feed_posts(event_id,author_id,body) values($1,$2,'Bypass')", [ids.event, ids.aliceAttendee]))).rejects.toThrow();
    const post = (await publish(ids.alice)).rows[0];
    await expect(asUser(db, ids.alice, () => db.query("update public.feed_posts set author_id=$1,created_at='2099-01-01',status='visible' where id=$2", [ids.bobAttendee, post.id]))).rejects.toThrow();
    await expect(asUser(db, ids.alice, () => db.query("insert into public.feed_reports(event_id,post_id,reporter_id,reason) values($1,$2,$3,'Bypass')", [ids.event, post.id, ids.aliceAttendee]))).rejects.toThrow();
  });
  it('requires a verified approved member in the enabled event', async () => {
    for (const user of [ids.outsider, ids.unverified]) await expect(publish(user)).rejects.toThrow();
    await expect(publish(ids.alice, 'Cross event', randomUUID(), ids.otherEvent)).rejects.toThrow();
    await db.query('update public.event_settings set feed_enabled=false where event_id=$1', [ids.event]);
    await expect(publish(ids.alice)).rejects.toThrow();
    await db.query('update public.event_settings set feed_enabled=true,community_enabled=false where event_id=$1', [ids.event]);
    await expect(publish(ids.alice)).rejects.toThrow();
  });
  it('retries once by idempotency key and snapshots only the intentional posting name', async () => {
    const client = randomUUID(), first = (await publish(ids.alice, 'Hello', client)).rows[0];
    expect((await publish(ids.alice, 'Hello', client)).rows[0].id).toBe(first.id);
    await expect(publish(ids.alice, 'Different body', client)).rejects.toThrow(/request ID/);
    const rows = (await asUser(db, ids.bob, () => db.query('select author_name,body from public.feed_posts'))).rows;
    expect(rows).toEqual([{ author_name: 'Alice Sample', body: 'Hello' }]);
    expect(JSON.stringify(rows)).not.toContain('alice@example');
  });
  it('blocks visibility and reporting in both directions despite private blocks-table RLS', async () => {
    const a = (await publish(ids.alice)).rows[0], b = (await publish(ids.bob)).rows[0];
    await asUser(db, ids.alice, () => db.query('select public.set_attendee_block($1,$2,true)', [ids.event, ids.bobAttendee]));
    expect((await asUser(db, ids.bob, () => db.query('select id from public.feed_posts where id=$1', [a.id]))).rows).toEqual([]);
    expect((await asUser(db, ids.alice, () => db.query('select id from public.feed_posts where id=$1', [b.id]))).rows).toEqual([]);
    await expect(asUser(db, ids.bob, () => db.query("select public.report_feed_post($1,$2,'Not visible')", [ids.event, a.id]))).rejects.toThrow();
  });
  it('uses author ownership and versions; cannot undo moderation or move between events', async () => {
    const post = (await publish(ids.alice)).rows[0];
    await expect(asUser(db, ids.bob, () => db.query("select public.edit_feed_post($1,$2,0,'Hijack',false)", [ids.event, post.id]))).rejects.toThrow();
    await asUser(db, ids.alice, () => db.query("select public.edit_feed_post($1,$2,0,'Revised',false)", [ids.event, post.id]));
    await expect(asUser(db, ids.alice, () => db.query("select public.edit_feed_post($1,$2,0,'Stale',false)", [ids.event, post.id]))).rejects.toThrow(/changed/);
    await asUser(db, ids.admin, () => db.query("select public.moderate_feed_post($1,$2,'hidden')", [ids.event, post.id]));
    await expect(asUser(db, ids.alice, () => db.query("select public.edit_feed_post($1,$2,2,'Unhide',false)", [ids.event, post.id]))).rejects.toThrow();
    expect((await asUser(db, ids.bob, () => db.query('select id from public.feed_posts where id=$1', [post.id]))).rows).toEqual([]);
    await expect(asUser(db, ids.bob, () => db.query("select public.moderate_feed_post($1,$2,'visible')", [ids.event, post.id]))).rejects.toThrow();
  });
  it('allows removal of an own visible post without exposing it to other attendees', async () => {
    const post = (await publish(ids.alice)).rows[0];
    await asUser(db, ids.alice, () => db.query("select public.edit_feed_post($1,$2,0,'',true)", [ids.event, post.id]));
    expect((await asUser(db, ids.bob, () => db.query('select id from public.feed_posts where id=$1', [post.id]))).rows).toEqual([]);
  });
  it('records private reports once and resolves them with an audited Admin decision', async () => {
    const post = (await publish(ids.alice)).rows[0];
    const report = (await asUser(db, ids.bob, () => db.query<{id:string}>("select public.report_feed_post($1,$2,'Please review') as id", [ids.event, post.id]))).rows[0];
    const again = (await asUser(db, ids.bob, () => db.query<{id:string}>("select public.report_feed_post($1,$2,'Please review') as id", [ids.event, post.id]))).rows[0];
    expect(again.id).toBe(report.id);
    expect((await asUser(db, ids.alice, () => db.query('select id from public.feed_reports where id=$1', [report.id]))).rows).toEqual([]);
    await asUser(db, ids.admin, () => db.query("select public.moderate_feed_post($1,$2,'hidden',$3,'reviewed')", [ids.event, post.id, report.id]));
    expect((await db.query('select status from public.feed_reports where id=$1', [report.id])).rows).toEqual([{ status: 'reviewed' }]);
    expect((await db.query("select id from public.audit_log where action='feed.moderated' and entity_id=$1", [post.id])).rows).toHaveLength(1);
  });
  it('limits new posts but never makes a confirmed retry consume a second allowance', async () => {
    const firstKey = randomUUID(); await publish(ids.alice,'First',firstKey);
    for (let index=1;index<10;index++) await publish(ids.alice,'Post '+index);
    await expect(publish(ids.alice,'Over the limit')).rejects.toThrow(/wait/);
    await expect(publish(ids.alice,'First',firstKey)).resolves.toBeTruthy();
  });
  it('withdraws a disabled attendee’s posting access and other members cannot read their posts', async () => {
    const post = (await publish(ids.alice)).rows[0];
    await db.query("update public.attendees set status='disabled' where id=$1", [ids.aliceAttendee]);
    await expect(publish(ids.alice)).rejects.toThrow();
    expect((await asUser(db, ids.bob, () => db.query('select id from public.feed_posts where id=$1', [post.id]))).rows).toEqual([]);
  });
});
