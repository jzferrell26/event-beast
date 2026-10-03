import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';
import { feedPhotoPath, feedPostInput } from '../src/lib/feed';

describe('bounded private photo albums', () => {
  let db: PGlite;
  const path = (client: string, slot: number) => feedPhotoPath(ids.event, ids.aliceAttendee, client, slot);
  const publish = async (client: string, count: number) => (await asUser(db, ids.alice, () => db.query<{id:string}>('select (public.publish_feed_post_with_photos($1,$2,$3,$4)).id as id', [ids.event,client,'Album',count]))).rows[0].id;
  const stage = async (client: string, count: number) => { for(let i=1;i<=count;i++) await asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path(client,i)])); };
  beforeAll(async()=>{db=await createDatabase({hostedFunctionGrants:true});await seedSecurityFixture(db);});
  beforeEach(async()=>{await db.exec("delete from public.feed_posts;delete from public.blocks;delete from storage.objects where bucket_id='event-feed-photos';update public.event_settings set community_enabled=true,feed_enabled=true;");});
  afterAll(async()=>{await db?.close();});
  it('publishes five immutable slots atomically and retries without duplicates',async()=>{
    const client=randomUUID();await stage(client,4);await expect(publish(client,5)).rejects.toThrow(/every selected/);
    expect((await db.query('select id from public.feed_posts')).rows).toHaveLength(0);
    await asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path(client,5)]));
    const id=await publish(client,5);expect(await publish(client,5)).toBe(id);
    expect((await db.query('select photo_count from public.feed_posts where id=$1',[id])).rows[0]).toEqual({photo_count:5});
    await expect(publish(client,4)).rejects.toThrow(/request ID/);
    expect((await asUser(db,ids.alice,()=>db.query("delete from storage.objects where bucket_id='event-feed-photos' returning name"))).rows).toHaveLength(0);
  });
  it('enforces the five-photo limit in HTTP schema, SQL and storage paths',async()=>{
    const client=randomUUID();expect(feedPostInput.safeParse({clientId:client,body:'x',photoCount:6}).success).toBe(false);
    await expect(publish(client,6)).rejects.toThrow();await expect(publish(client,-1)).rejects.toThrow();
    await expect(asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[`${ids.event}/${ids.aliceAttendee}/${client}-6.webp`]))).rejects.toThrow();
    await expect(asUser(db,ids.bob,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path(client,2)]))).rejects.toThrow();
  });
  it('withdraws every slot on moderation/blocking, while retaining organizer access',async()=>{
    const client=randomUUID();await stage(client,5);const id=await publish(client,5);
    expect((await asUser(db,ids.bob,()=>db.query("select name from storage.objects where bucket_id='event-feed-photos'"))).rows).toHaveLength(5);
    await asUser(db,ids.admin,()=>db.query("select public.moderate_feed_post($1,$2,'hidden')",[ids.event,id]));
    expect((await asUser(db,ids.bob,()=>db.query("select name from storage.objects where bucket_id='event-feed-photos'"))).rows).toHaveLength(0);
    expect((await asUser(db,ids.admin,()=>db.query("select name from storage.objects where bucket_id='event-feed-photos'"))).rows).toHaveLength(5);
    await asUser(db,ids.admin,()=>db.query("select public.moderate_feed_post($1,$2,'visible')",[ids.event,id]));
    await asUser(db,ids.alice,()=>db.query('select public.set_attendee_block($1,$2,true)',[ids.event,ids.bobAttendee]));
    expect((await asUser(db,ids.bob,()=>db.query("select name from storage.objects where bucket_id='event-feed-photos'"))).rows).toHaveLength(0);
  });
  it('does not expose unused slots or allow extra attachments after publication',async()=>{
    const client=randomUUID();await stage(client,2);await publish(client,1);
    expect((await asUser(db,ids.bob,()=>db.query('select name from storage.objects where name=$1',[path(client,2)]))).rows).toHaveLength(0);
    await expect(asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path(client,3)]))).rejects.toThrow();
    expect((await asUser(db,ids.alice,()=>db.query('delete from storage.objects where name=$1 returning name',[path(client,2)]))).rows).toHaveLength(1);
  });
});
