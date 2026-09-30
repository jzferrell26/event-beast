import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser,createDatabase,ids,seedSecurityFixture } from './db-harness';

describe('private add-only registration intake',()=>{
 let db:PGlite;
 beforeAll(async()=>{db=await createDatabase({hostedFunctionGrants:true});await seedSecurityFixture(db);});
 afterAll(async()=>{await db.close();});
 const preview=async(rows:unknown)=>asUser(db,ids.admin,async()=> (await db.query<{result:Record<string,unknown>}>('select public.preview_attendee_import($1,$2) as result',[ids.event,JSON.stringify(rows)])).rows[0].result);
 const commit=async(rows:unknown,token:unknown)=>asUser(db,ids.admin,async()=> (await db.query<{result:Record<string,unknown>}>('select public.commit_attendee_import($1,$2,$3) as result',[ids.event,JSON.stringify(rows),token])).rows[0].result);
 it('previews and imports 500 synthetic registrations; repeat preserves every existing row and creates no Auth/profile',async()=>{
  const rows=Array.from({length:500},(_,i)=>({email:`cohort-${i}@example.test`,name:`Attendee ${i}`,phone:`555-${i}`}));
  const before=(await db.query<{count:number}>('select count(*)::integer as count from auth.users')).rows[0].count;
  const p=await preview(rows);expect(p).toMatchObject({new:500,existing:0,emails_sent:0,mode:'add_missing_only'});
  expect((await db.query("select id from public.attendees where registration_email like 'cohort-%'")).rows).toHaveLength(0);
  expect(await commit(rows,p.preview_token)).toMatchObject({created:500,existing:0,emails_sent:0});
  const second=await preview(rows);expect(second).toMatchObject({new:0,existing:500});
  expect(await commit(rows,second.preview_token)).toMatchObject({created:0,existing:500});
  expect((await db.query('select attendee_id from public.attendee_profiles')).rows).toHaveLength(2);
  expect((await db.query<{count:number}>('select count(*)::integer as count from auth.users')).rows[0].count).toBe(before);
 });
 it('never renames a claimed organizer, overwrites a phone, changes roles or reactivates disabled access',async()=>{
  await db.query("update public.attendees set access_role='admin' where id=$1",[ids.aliceAttendee]);
  await db.query("update public.attendees set access_role='sponsor',status='disabled',directory_allowed=false where id=$1",[ids.bobAttendee]);
  await db.query("insert into public.attendee_contacts(event_id,attendee_id,phone) values($1,$2,'KEEP PHONE')",[ids.event,ids.aliceAttendee]);
  const before=(await db.query('select * from public.attendees where id in($1,$2) order by id',[ids.aliceAttendee,ids.bobAttendee])).rows;
  const rows=[{email:' ALICE@example.test ',name:'Wrong old spreadsheet name',phone:''},{email:'bob@example.test',name:'Wrong again',phone:'999'}];
  const p=await preview(rows);expect(p).toMatchObject({existing:2,new:0,privileged:2,disabled:1,claimed:2});
  await commit(rows,p.preview_token);
  expect((await db.query('select * from public.attendees where id in($1,$2) order by id',[ids.aliceAttendee,ids.bobAttendee])).rows).toEqual(before);
  expect((await db.query('select phone from public.attendee_contacts where attendee_id=$1',[ids.aliceAttendee])).rows).toEqual([{phone:'KEEP PHONE'}]);
 });
 it('requires a fresh preview when the file or a matched registration changes',async()=>{
  const rows=[{email:'alice@example.test',name:'Alice'},{email:'new-preview@example.test',name:'New'}];
  const p=await preview(rows);
  await expect(commit([{...rows[1],name:'Different file'}],p.preview_token)).rejects.toThrow(/roster changed/);
  await db.query("update public.attendees set directory_allowed=false where id=$1",[ids.aliceAttendee]);
  await expect(commit(rows,p.preview_token)).rejects.toThrow(/roster changed/);
  expect((await db.query("select id from public.attendees where registration_email='new-preview@example.test'")).rows).toHaveLength(0);
 });
 it('rejects direct-RPC malformed input and rolls back the whole file',async()=>{
  for(const invalid of [null,{},[],[{email:'bad',name:'Bad'}],[{email:'a@example.test',name:'A',access_role:'admin'}],[{email:'a@example.test',name:'A',phone:7}], [{email:'d@example.test',name:'D'},{email:'D@example.test',name:'Duplicate'}]]) {
   await expect(asUser(db,ids.admin,()=>db.query('select public.import_attendees($1,$2)',[ids.event,JSON.stringify(invalid)]))).rejects.toThrow();
  }
  const rows=[{email:'atomic-new@example.test',name:'Valid'},{email:'broken',name:'Invalid'}];
  await expect(asUser(db,ids.admin,()=>db.query('select public.import_attendees($1,$2)',[ids.event,JSON.stringify(rows)]))).rejects.toThrow();
  expect((await db.query("select id from public.attendees where registration_email='atomic-new@example.test'")).rows).toHaveLength(0);
 });
 it('keeps preview, contacts and commit unavailable to anonymous, Member, Sponsor, unverified and wrong-event actors',async()=>{
  const rows=JSON.stringify([{email:'forbidden@example.test',name:'Forbidden'}]);
  for(const user of [null,ids.bob,ids.outsider,ids.unverified]) {
   await expect(asUser(db,user,()=>db.query('select public.preview_attendee_import($1,$2)',[ids.event,rows]))).rejects.toThrow();
   await expect(asUser(db,user,()=>db.query('select public.import_attendees($1,$2)',[ids.event,rows]))).rejects.toThrow();
  }
  await expect(asUser(db,ids.admin,()=>db.query('select public.preview_attendee_import($1,$2)',[ids.otherEvent,rows]))).rejects.toThrow();
  const grants=await db.query("select has_function_privilege('authenticated','public.normalize_attendee_import(jsonb)','EXECUTE') as normalizer,has_function_privilege('authenticated','public.import_attendee_registrations(uuid,jsonb)','EXECUTE') as legacy");
  expect(grants.rows).toEqual([{normalizer:false,legacy:false}]);
 });
});
