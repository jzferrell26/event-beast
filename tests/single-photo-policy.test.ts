import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('single-photo launch policy after historical album migration',()=>{
  let db:PGlite;
  beforeAll(async()=>{db=await createDatabase({hostedFunctionGrants:true});await seedSecurityFixture(db);});
  beforeEach(async()=>{await db.exec("delete from public.feed_posts;delete from storage.objects where bucket_id='event-feed-photos';update public.event_settings set community_enabled=true,feed_enabled=true;");});
  afterAll(async()=>{await db?.close();});

  it('rejects extra storage slots and a two-photo publish request',async()=>{
    const client=randomUUID(), base=`${ids.event}/${ids.aliceAttendee}/${client}.webp`;
    await asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[base]));
    await expect(asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[base.replace('.webp','-2.webp')]))).rejects.toThrow();
    await expect(asUser(db,ids.alice,()=>db.query("select public.publish_feed_post_with_photos($1,$2,'No album',$3)",[ids.event,client,2]))).rejects.toThrow(/one photo/i);
  });

  it('publishes exactly one photo and preserves retry idempotency',async()=>{
    const client=randomUUID(), path=`${ids.event}/${ids.aliceAttendee}/${client}.webp`;
    await asUser(db,ids.alice,()=>db.query("insert into storage.objects(bucket_id,name) values('event-feed-photos',$1)",[path]));
    const publish=()=>asUser(db,ids.alice,()=>db.query<{id:string,photo_count:number}>("select (p).id,(p).photo_count from (select public.publish_feed_post_with_photo($1,$2,'Single',true) p) q",[ids.event,client]));
    const first=await publish(), second=await publish();
    expect(first.rows[0].photo_count).toBe(1);expect(second.rows[0].id).toBe(first.rows[0].id);
  });
});
