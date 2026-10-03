import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('social wall photos, replies and likes', () => {
  let db: PGlite;
  const photoPath = (client: string, author = ids.aliceAttendee, event = ids.event) => `${event}/${author}/${client}.webp`;
  const publish = async (user = ids.alice, body = 'A moment at the event', image = false, client = randomUUID()) =>
    (await asUser(db, user, () => db.query<{ id: string }>('select (public.publish_feed_post_with_photo($1,$2,$3,$4)).id as id', [ids.event,client,body,image]))).rows[0].id;
  const reply = async (post: string, body = 'Great takeaway', user = ids.bob, client = randomUUID(), event = ids.event) =>
    (await asUser(db, user, () => db.query<{ id: string }>('select (public.publish_feed_reply($1,$2,$3,$4)).id as id',[event,post,client,body]))).rows[0].id;
  beforeAll(async () => { db = await createDatabase({ hostedFunctionGrants: true }); await seedSecurityFixture(db); });
  beforeEach(async () => {
    await db.exec("delete from public.feed_posts; delete from public.blocks; delete from storage.objects where bucket_id='event-feed-photos'; update public.attendees set status='approved'; update public.event_settings set community_enabled=true,feed_enabled=true;");
  });
  afterAll(async () => { await db?.close(); });

  it('keeps the photo bucket private, rejects anonymous reads and forged paths', async () => {
    expect((await db.query('select public,file_size_limit,allowed_mime_types from storage.buckets where id=$1',['event-feed-photos'])).rows[0]).toEqual({ public:false,file_size_limit:3145728,allowed_mime_types:['image/webp'] });
    const path = photoPath(randomUUID());
    await asUser(db, ids.alice, () => db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path]));
    expect((await asUser(db, null, () => db.query("select name from storage.objects where bucket_id='event-feed-photos'"))).rows).toEqual([]);
    expect((await asUser(db, ids.bob, () => db.query('select name from storage.objects where name=$1',[path]))).rows).toEqual([]);
    await expect(asUser(db, ids.bob, () => db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[photoPath(randomUUID())]))).rejects.toThrow();
    await expect(asUser(db, ids.alice, () => db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[photoPath(randomUUID(),ids.aliceAttendee,ids.otherEvent)]))).rejects.toThrow();
    await expect(asUser(db, ids.unverified, () => db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[photoPath(randomUUID(),ids.thirdAttendee)]))).rejects.toThrow();
  });
  it('accepts photo-only posts, retries once, and refuses absent/replaced attachments', async () => {
    const client = randomUUID(), path = photoPath(client);
    await expect(publish(ids.alice,'',true,client)).rejects.toThrow(/Upload/);
    await asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path]));
    const id = await publish(ids.alice,'',true,client);
    expect(await publish(ids.alice,'',true,client)).toBe(id);
    await expect(publish(ids.alice,'changed',true,client)).rejects.toThrow(/request ID/);
    await expect(publish(ids.alice,'text',false,client)).rejects.toThrow(/request ID/);
    expect((await asUser(db,ids.bob,()=>db.query('select name from storage.objects where name=$1',[path]))).rows).toHaveLength(1);
    expect((await asUser(db,ids.alice,()=>db.query('delete from storage.objects where name=$1 returning name',[path]))).rows).toHaveLength(0);
    await expect(asUser(db,ids.alice,()=>db.query("update public.feed_posts set image_path=null where id=$1",[id]))).rejects.toThrow();
    await asUser(db,ids.alice,()=>db.query("select public.edit_feed_post($1,$2,0,'',false)",[ids.event,id]));
    await expect(publish(ids.alice,'',false)).rejects.toThrow();
  });
  it('hiding a parent hides photos, replies and likes, but Admin retains moderation visibility', async () => {
    const client=randomUUID(), path=photoPath(client);
    await db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path]);
    const post=await publish(ids.alice,'Our photo',true,client); const comment=await reply(post);
    await asUser(db,ids.bob,()=>db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]));
    await asUser(db,ids.admin,()=>db.query("select public.moderate_feed_post($1,$2,'hidden')",[ids.event,post]));
    for(const user of [ids.alice,ids.bob]) {
      expect((await asUser(db,user,()=>db.query('select name from storage.objects where name=$1',[path]))).rows).toEqual([]);
      expect((await asUser(db,user,()=>db.query('select id from public.feed_replies where id=$1',[comment]))).rows).toEqual([]);
      expect((await asUser(db,user,()=>db.query('select * from public.feed_likes where post_id=$1',[post]))).rows).toEqual([]);
    }
    expect((await asUser(db,ids.admin,()=>db.query('select name from storage.objects where name=$1',[path]))).rows).toHaveLength(1);
    await expect(reply(post)).rejects.toThrow();
    await expect(asUser(db,ids.bob,()=>db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]))).rejects.toThrow();
    await asUser(db,ids.admin,()=>db.query("select public.moderate_feed_post($1,$2,'visible')",[ids.event,post]));
    expect((await asUser(db,ids.bob,()=>db.query('select id from public.feed_replies where id=$1',[comment]))).rows).toHaveLength(1);
  });
  it('uses one desired-state like and retry-safe replies without contact information', async () => {
    const post=await publish(), client=randomUUID(), first=await reply(post,'Hello',ids.bob,client);
    expect(await reply(post,'Hello',ids.bob,client)).toBe(first);
    await expect(reply(post,'Changed',ids.bob,client)).rejects.toThrow(/request ID/);
    await asUser(db,ids.bob,async()=>{
      await db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]);
      await db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]);
      const result=(await db.query('select * from public.feed_engagement($1,$2)',[ids.event,[post]])).rows[0];
      expect(result).toEqual({post_id:post,like_count:1,liked_by_me:true,reply_count:1});
      await db.query('select public.set_feed_like($1,$2,false)',[ids.event,post]);
      await db.query('select public.set_feed_like($1,$2,false)',[ids.event,post]);
      expect((await db.query('select * from public.feed_likes')).rows).toEqual([]);
    });
    const rows=(await asUser(db,ids.alice,()=>db.query('select author_name,body from public.feed_replies'))).rows;
    expect(rows).toEqual([{author_name:'Bob Sample',body:'Hello'}]); expect(JSON.stringify(rows)).not.toContain('@');
  });
  it('enforces reply ownership, versions, reporting and organizer decisions', async()=>{
    const post=await publish(), id=await reply(post);
    await expect(asUser(db,ids.alice,()=>db.query("select public.edit_feed_reply($1,$2,0,'Not mine',false)",[ids.event,id]))).rejects.toThrow();
    await asUser(db,ids.bob,()=>db.query("select public.edit_feed_reply($1,$2,0,'Updated reply',false)",[ids.event,id]));
    await expect(asUser(db,ids.bob,()=>db.query("select public.edit_feed_reply($1,$2,0,'Stale',false)",[ids.event,id]))).rejects.toThrow(/changed/);
    const report=(await asUser(db,ids.alice,()=>db.query<{id:string}>("select public.report_feed_reply($1,$2,'Please review') as id",[ids.event,id]))).rows[0].id;
    expect((await asUser(db,ids.alice,()=>db.query<{id:string}>("select public.report_feed_reply($1,$2,'Please review') as id",[ids.event,id]))).rows[0].id).toBe(report);
    expect((await asUser(db,ids.bob,()=>db.query('select * from public.feed_reply_reports'))).rows).toEqual([]);
    await expect(asUser(db,ids.bob,()=>db.query("select public.moderate_feed_reply($1,$2,'visible')",[ids.event,id]))).rejects.toThrow();
    await asUser(db,ids.admin,()=>db.query("select public.moderate_feed_reply($1,$2,'hidden',$3,'reviewed')",[ids.event,id,report]));
    await expect(asUser(db,ids.bob,()=>db.query("select public.edit_feed_reply($1,$2,2,'Unhide',false)",[ids.event,id]))).rejects.toThrow();
    expect((await db.query('select status from public.feed_reply_reports where id=$1',[report])).rows[0]).toEqual({status:'reviewed'});
    expect((await db.query("select id from public.audit_log where action='feed.reply_moderated' and entity_id=$1",[id])).rows).toHaveLength(1);
  });
  it('rejects unverified, cross-event, disabled and directly forged writes', async()=>{
    const post=await publish();
    for(const user of [null,ids.unverified,ids.outsider]) {
      await expect(asUser(db,user,()=>db.query("select public.publish_feed_reply($1,$2,gen_random_uuid(),'No')",[ids.event,post]))).rejects.toThrow();
      await expect(asUser(db,user,()=>db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]))).rejects.toThrow();
    }
    await expect(reply(post,'Cross',ids.bob,randomUUID(),ids.otherEvent)).rejects.toThrow();
    await expect(asUser(db,ids.bob,()=>db.query("insert into public.feed_replies(event_id,post_id,author_id,client_id,author_name,body) values($1,$2,$3,gen_random_uuid(),'Forged','No')",[ids.event,post,ids.aliceAttendee]))).rejects.toThrow();
    await expect(asUser(db,ids.bob,()=>db.query('insert into public.feed_likes(event_id,post_id,attendee_id) values($1,$2,$3)',[ids.event,post,ids.aliceAttendee]))).rejects.toThrow();
    await db.query("update public.attendees set status='disabled' where id=$1",[ids.bobAttendee]);
    await expect(reply(post)).rejects.toThrow();
  });
  it('respects two-way blocks for reply content, counts and post interaction',async()=>{
    const a=await publish(), b=await publish(ids.bob), comment=await reply(a);
    await asUser(db,ids.bob,()=>db.query('select public.set_feed_like($1,$2,true)',[ids.event,a]));
    await asUser(db,ids.alice,()=>db.query('select public.set_attendee_block($1,$2,true)',[ids.event,ids.bobAttendee]));
    expect((await asUser(db,ids.alice,()=>db.query('select id from public.feed_replies where id=$1',[comment]))).rows).toEqual([]);
    expect((await asUser(db,ids.alice,()=>db.query('select * from public.feed_engagement($1,$2)',[ids.event,[a]]))).rows[0]).toMatchObject({like_count:0,reply_count:0});
    await expect(reply(a)).rejects.toThrow(); await expect(reply(b,'No',ids.alice)).rejects.toThrow();
  });
  it('rate-limits new replies, not confirmed retries, and honors the wall pause',async()=>{
    const post=await publish(), client=randomUUID(); await reply(post,'First',ids.bob,client);
    for(let i=1;i<30;i++) await reply(post,'Reply '+i);
    await expect(reply(post,'Too many')).rejects.toThrow(/wait/);
    await expect(reply(post,'First',ids.bob,client)).resolves.toBeTruthy();
    await db.query('update public.event_settings set feed_enabled=false where event_id=$1',[ids.event]);
    await expect(reply(post,'Paused')).rejects.toThrow();
    await expect(asUser(db,ids.bob,()=>db.query('select public.set_feed_like($1,$2,true)',[ids.event,post]))).rejects.toThrow();
  });
});
