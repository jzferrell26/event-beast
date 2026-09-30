import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {backendAdmin,backendEnvironment,PROJECT_REF,EVENT_ID,query} from './backend-cli.mjs';

// Real database/RPC rehearsal in an isolated unpublished event. No email calls,
// real registration changes, or member profile creation for imported rows.
const file='supabase/.temp/roster-intake-qa.json';await mkdir('supabase/.temp',{recursive:true});
const old=JSON.parse(await readFile(file,'utf8').catch(()=>'null'));
const cleanupOnly=process.argv.includes('--cleanup');
assert.ok(cleanupOnly||!old||old.cleanedUp,'Complete the prior isolated test cleanup before running again.');
const state=cleanupOnly?old:{event:randomUUID(),slug:'roster-qa-'+randomUUID(),users:[],cleanedUp:false};
assert.ok(state&&/^[a-f0-9-]{36}$/.test(state.event)&&/^roster-qa-[a-f0-9-]{36}$/.test(state.slug));
const persist=()=>writeFile(file,JSON.stringify(state,null,2),{mode:0o600});await persist();
const admin=backendAdmin(),env=backendEnvironment();
const checked=(result,label)=>{if(result.error)throw new Error(label+': '+result.error.message);return result.data;};
const client=()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(15000)})}});
const checks=[];let failure=null;
const run=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(JSON.stringify(checks.at(-1)));};
try{
 if(!cleanupOnly){
 checked(await admin.from('events').insert({id:state.event,slug:state.slug,name:'Synthetic roster intake rehearsal',published:false,public_guide:false,is_demo:true}),'Create isolated test event');
 checked(await admin.from('event_settings').insert({event_id:state.event}),'Isolated settings');
 const clients=[];
 for(const role of ['admin','member']){
  const email=`roster-qa-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!aA9`;
  const user=checked(await admin.auth.admin.createUser({email,password,email_confirm:true}),'Synthetic identity').user;
  state.users.push({id:user.id,email});await persist();
  checked(await admin.from('attendees').insert({event_id:state.event,registration_email:email,registration_name:'Original '+role,access_role:role,directory_allowed:false}),'Isolated permission');
  const db=client();checked(await db.auth.signInWithPassword({email,password}),'Synthetic sign in');checked(await db.rpc('claim_attendee',{p_event:state.event}),'Claim synthetic registration');clients.push(db);
 }
 const [organizer,member]=clients;
 const rows=Array.from({length:500},(_,i)=>({email:`roster-${i}-${state.event}@example.test`,name:`Synthetic ${i}`,phone:`555-${i}`}));
 await run('Preview does not write and 500 registrations are added only to the isolated event',async()=>{
  const p=checked(await organizer.rpc('preview_attendee_import',{p_event:state.event,p_rows:rows}),'Hosted preview');assert.equal(p.new,500);
  const count=await admin.from('attendees').select('id',{head:true,count:'exact'}).eq('event_id',state.event);assert.equal(count.count,2);
  const saved=checked(await organizer.rpc('commit_attendee_import',{p_event:state.event,p_rows:rows,p_preview_token:p.preview_token}),'Hosted commit');assert.equal(saved.created,500);assert.equal(saved.emails_sent,0);
 });
 await run('Repeating the cohort creates zero duplicates and no profiles or Auth users for imported attendees',async()=>{
  const p=checked(await organizer.rpc('preview_attendee_import',{p_event:state.event,p_rows:rows}),'Repeat preview');assert.equal(p.new,0);assert.equal(p.existing,500);
  const repeat=checked(await organizer.rpc('commit_attendee_import',{p_event:state.event,p_rows:rows,p_preview_token:p.preview_token}),'Repeat commit');assert.equal(repeat.created,0);
  const registrations=await admin.from('attendees').select('id',{head:true,count:'exact'}).eq('event_id',state.event);assert.equal(registrations.count,502);
  const profiles=await admin.from('attendee_profiles').select('attendee_id',{head:true,count:'exact'}).eq('event_id',state.event);assert.equal(profiles.count,2);
  const bound=await admin.from('attendees').select('id',{head:true,count:'exact'}).eq('event_id',state.event).not('user_id','is',null);assert.equal(bound.count,2);
 });
 await run('Members and anonymous clients cannot preview, import or read private contact details',async()=>{
  for(const db of [member,client()])assert.ok((await db.rpc('preview_attendee_import',{p_event:state.event,p_rows:rows})).error);
  assert.ok((await member.rpc('import_attendees',{p_event:state.event,p_rows:rows})).error);
  assert.equal(checked(await member.from('attendee_contacts').select('attendee_id').eq('event_id',state.event),'Member contact read').length,0);
  assert.ok((await organizer.rpc('preview_attendee_import',{p_event:EVENT_ID,p_rows:rows})).error,'Synthetic organizer cannot touch the real event');
 });
 await run('Existing registrations remain unchanged and a stale file checksum cannot commit',async()=>{
  const user=state.users[1];const before=checked(await admin.from('attendees').select('*').eq('event_id',state.event).eq('registration_email',user.email).single(),'Existing record');
  checked(await organizer.rpc('import_attendees',{p_event:state.event,p_rows:[{email:user.email,name:'Do not overwrite',phone:'999'}]}),'Repeated existing record');
  const after=checked(await admin.from('attendees').select('*').eq('event_id',state.event).eq('registration_email',user.email).single(),'Existing record readback');assert.deepEqual(after,before);
  const p=checked(await organizer.rpc('preview_attendee_import',{p_event:state.event,p_rows:rows}),'Checksum');
  const changed=await organizer.rpc('commit_attendee_import',{p_event:state.event,p_rows:[{email:'unused@example.test',name:'Different'}],p_preview_token:p.preview_token});assert.equal(changed.error?.code,'PT409');assert.equal(changed.status,409);
 });
 }
}catch(e){failure=e;console.error(JSON.stringify({failed:true,message:e.message}));}
finally{
 try{
  assert.notEqual(state.event,EVENT_ID);assert.ok(state.slug.startsWith('roster-qa-'));
  const events=checked(await admin.from('events').select('slug').eq('id',state.event),'Validate cleanup scope');
  if(events.length){
   assert.equal(events[0].slug,state.slug);
   // Audit triggers need the parent to exist while deleting children. Clear
   // this test event's generated audits last, then the unpublished test event.
   const tables=['attendee_contacts','attendee_preferences','attendee_profiles','attendees','event_admins','event_settings','audit_log'];
   query(`begin;${tables.map(table=>`delete from public.${table} where event_id='${state.event}';`).join('\n')}delete from public.events where id='${state.event}' and slug='${state.slug}';commit;`);
  }
  for(const user of state.users){assert.ok(user.email.startsWith('roster-qa-')&&user.email.endsWith('@example.test'));const identity=checked(await admin.auth.admin.getUserById(user.id),'Check cleanup identity').user;assert.equal(identity.email,user.email);checked(await admin.auth.admin.deleteUser(user.id),'Remove synthetic identity');}
  state.cleanedUp=true;await persist();
 }catch(e){failure=e;console.error(JSON.stringify({cleanupFailed:true,message:e.message}));}
 const report={checkedAt:new Date().toISOString(),project:PROJECT_REF,passed:!failure,checks,syntheticCohort:500,isolatedEvent:true,realEventRegistrationsChanged:false,emailsSent:0,cleanedUp:state.cleanedUp,qualifiesEmailDelivery:false};
 if(!cleanupOnly)await writeFile('docs/attendee-intake-hosted-qualification.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:!failure,cleanupOnly,cleanedUp:state.cleanedUp,checks:checks.length}));
 if(failure)process.exitCode=1;
}
