import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { backendAdmin, EVENT_ID, PROJECT_REF, query } from './backend-cli.mjs';

const site='https://event-beast.vercel.app';
const admin=backendAdmin();
const statePath='supabase/.temp/hub-qualification-state.json';
const prior=JSON.parse(await readFile(statePath,'utf8').catch(()=>'null'));
assert.ok(!prior||prior.cleanedUp,'Inspect/clean the recorded synthetic cohort before retrying.');
const nonce=randomUUID().slice(0,8);
const state={users:[],records:[],cleanedUp:false};
const saveState=()=>writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});
await mkdir('test-results/live-hub',{recursive:true});await saveState();
const checked=(result,label)=>{if(result.error)throw new Error(label+': '+result.error.message);return result.data;};
const checkJson=async(response,label)=>{const body=await response.json();assert.ok(response.ok(),`${label}: ${response.status()} ${body.error??''}`);return body;};
const results=[];let browser,failure,release;
const run=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(JSON.stringify(results.at(-1)));};
let debugPage;
try{
 release=await(await fetch(site+'/api/release')).json();assert.equal(release.mode,'live');
 browser=await chromium.launch();
 const makeAccount=async(label,role)=>{
  const email=`event-beast-hub-qa-${label}-${nonce}@example.test`,password=`EventTest-${randomUUID()}!aA`;
  const invitation=checked(await admin.auth.admin.generateLink({type:'invite',email,options:{redirectTo:site+'/reset-password'}}),'Synthetic invitation');
  const user={id:invitation.user.id,email,label,role};state.users.push(user);await saveState();
  const registration=checked(await admin.from('attendees').insert({event_id:EVENT_ID,registration_email:email,registration_name:`QA ${label} ${nonce}`,access_role:role,status:'approved',directory_allowed:true}).select('id').single(),'Synthetic registration');
  user.attendee=registration.id;await saveState();
  const link=new URL('/auth/confirm',site);link.searchParams.set('token_hash',invitation.properties.hashed_token);link.searchParams.set('type','invite');link.searchParams.set('next','/admin');
  for(let count=0;count<2;count++){const response=await fetch(link);assert.equal(response.status,200);assert.ok((await response.text()).includes('Continue securely'));}
  assert.ok(!checked(await admin.auth.admin.getUserById(user.id),'Pre-consumption identity').user.email_confirmed_at,'Passive GET consumed an invitation');
  const context=await browser.newContext({serviceWorkers:'block',viewport:label==='alice'?{width:390,height:844}:{width:1440,height:1000}});
  const page=await context.newPage();debugPage=page;
  await page.goto(link.toString());await page.getByRole('button',{name:'Continue securely',exact:true}).click();await page.waitForURL('**/reset-password');
  await expect(page.getByText(email,{exact:true})).toBeVisible();
  await page.locator('input[autocomplete="new-password"]').first().fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.waitForURL(site+(role==='admin'?'/admin':'/more/profile'));
  const me=await checkJson(await context.request.get(site+'/api/me'),'Own identity');assert.equal(me.attendeeId,user.attendee);assert.equal(me.isAdmin,role==='admin');
  assert.equal(me.profile.directory_visible,false,'Registration did not default to private');
  return {...user,context,page,password};
 };
 let organizer,alice,bob;
 await run('Passive email scanners cannot consume invites; actual clicks activate exact Admin and Member roles',async()=>{organizer=await makeAccount('organizer','admin');alice=await makeAccount('alice','member');bob=await makeAccount('bob','member');});
 const profile=async(account)=>checkJson(await account.context.request.patch(site+'/api/profile',{headers:{Origin:site},data:{full_name:`QA ${account.label} ${nonce}`,company:'Synthetic test only',title:'Test attendee',city:'',state:'',bio:'Temporary qualification profile',interests:[],directory_visible:true,messaging_available:true}}),'Own profile consent');
 await run('Profile opt-in is explicit and attendee directory never returns CRM contacts',async()=>{
  await profile(alice);await profile(bob);
  const people=await checkJson(await alice.context.request.get(site+'/api/people?q='+encodeURIComponent(nonce)),'Directory');
  assert.ok(people.people.some(p=>p.attendee_id===bob.attendee));
  const value=JSON.stringify(people);for(const forbidden of ['registration_email','public_email','public_phone','@example.test'])assert.ok(!value.includes(forbidden));
  assert.equal((await alice.context.request.get(site+'/api/admin/users')).status(),403);
  const anon=await fetch(site+'/api/feed');assert.equal(anon.status,401);assert.ok(anon.headers.get('cache-control').includes('no-store'));
 });
 let post;
 await run('Social wall writes persist once across retries, reloads and two authenticated browsers',async()=>{
  const payload={clientId:randomUUID(),body:`QA-${nonce}: social wall persistence check`};
  post=await checkJson(await alice.context.request.post(site+'/api/feed',{headers:{Origin:site},data:payload}),'Publish wall post');
  const retry=await checkJson(await alice.context.request.post(site+'/api/feed',{headers:{Origin:site},data:payload}),'Retry wall post');assert.equal(retry.id,post.id);
  const feed=await checkJson(await bob.context.request.get(site+'/api/feed'),'Second account feed');assert.equal(feed.posts.filter(p=>p.id===post.id).length,1);
  assert.equal(feed.posts.find(p=>p.id===post.id).author_name,`QA alice ${nonce}`);
  await alice.page.goto(site+'/feed');await expect(alice.page.getByText(payload.body,{exact:true})).toBeVisible();await alice.page.reload();await expect(alice.page.getByText(payload.body,{exact:true})).toBeVisible();
  await bob.page.goto(site+'/feed');await expect(bob.page.getByText(payload.body,{exact:true})).toBeVisible();
  await alice.page.screenshot({path:'test-results/live-hub/social-wall-phone.png',fullPage:true});
  assert.equal((await bob.context.request.patch(site+'/api/feed/'+post.id,{headers:{Origin:site},data:{version:0,body:'Unauthorized edit',remove:false}})).status(),403);
 });
 await run('Reports reach Admin-only moderation; authors cannot restore a hidden post',async()=>{
  await checkJson(await bob.context.request.post(site+'/api/feed/'+post.id,{headers:{Origin:site},data:{reason:`QA-${nonce}: moderation test`}}),'Report wall post');
  const moderation=await checkJson(await organizer.context.request.get(site+'/api/admin/feed'),'Moderation');const report=moderation.reports.find(r=>r.post_id===post.id);assert.ok(report);
  await checkJson(await organizer.context.request.patch(site+'/api/admin/feed',{headers:{Origin:site},data:{postId:post.id,status:'hidden',reportId:report.id,reportStatus:'reviewed'}}),'Hide and resolve');
  const after=await checkJson(await bob.context.request.get(site+'/api/feed'),'Moderated wall');assert.ok(!after.posts.some(p=>p.id===post.id));
  assert.equal((await alice.context.request.patch(site+'/api/feed/'+post.id,{headers:{Origin:site},data:{version:1,body:'Attempt restore',remove:false}})).status(),403);
 });
 let conversation;
 await run('Private one-to-one messaging persists across browsers and never appears on the social wall',async()=>{
  conversation=await checkJson(await alice.context.request.post(site+'/api/inbox',{headers:{Origin:site},data:{recipient:bob.attendee}}),'Open conversation');
  const payload={client_id:randomUUID(),body:`QA-${nonce}: PRIVATE message`};
  const sent=await checkJson(await alice.context.request.post(site+'/api/inbox/'+conversation.id,{headers:{Origin:site},data:payload}),'Send private message');
  const again=await checkJson(await alice.context.request.post(site+'/api/inbox/'+conversation.id,{headers:{Origin:site},data:payload}),'Retry private message');assert.equal(sent.message.id,again.message.id);
  await bob.page.goto(site+'/inbox/'+conversation.id);await expect(bob.page.getByText(payload.body,{exact:true})).toBeVisible();await bob.page.reload();await expect(bob.page.getByText(payload.body,{exact:true})).toBeVisible();
  const feed=await checkJson(await bob.context.request.get(site+'/api/feed'),'Private/wall separation');assert.ok(!JSON.stringify(feed).includes(payload.body));
  assert.equal((await organizer.context.request.get(site+'/api/inbox/'+conversation.id)).status(),404,'Admin must not read unreported private messages');
  await checkJson(await bob.context.request.post(site+'/api/moderation',{headers:{Origin:site},data:{action:'block',target:alice.attendee,blocked:true}}),'Block');
  assert.equal((await alice.context.request.post(site+'/api/inbox/'+conversation.id,{headers:{Origin:site},data:{client_id:randomUUID(),body:'After block'}})).status(),403);
 });
 await run('Recovery link requires a recipient click and then accepts the new password for fresh login',async()=>{
  const recovery=checked(await admin.auth.admin.generateLink({type:'recovery',email:alice.email}),'Synthetic recovery');
  const link=new URL('/auth/confirm',site);link.searchParams.set('token_hash',recovery.properties.hashed_token);link.searchParams.set('type','recovery');
  assert.equal((await fetch(link)).status,200);
  await alice.page.goto(link.toString());await alice.page.getByRole('button',{name:'Continue securely'}).click();await alice.page.waitForURL('**/reset-password');
  const password=`Changed-${randomUUID()}!aA`;
  await alice.page.locator('input[autocomplete="new-password"]').first().fill(password);await alice.page.getByLabel('Confirm password',{exact:true}).fill(password);await alice.page.getByRole('button',{name:'Update password'}).click();await alice.page.waitForURL('**/more/profile');
  await checkJson(await alice.context.request.post(site+'/api/auth',{headers:{Origin:site},data:{action:'sign-out'}}),'Sign out');
  await checkJson(await alice.context.request.post(site+'/api/auth',{headers:{Origin:site},data:{action:'sign-in',email:alice.email,password,next:'/account-ready'}}),'Fresh login');
  await alice.page.goto(site+'/account-ready');await alice.page.waitForURL('**/more/profile');
 });
 await run('Organizer can save/reload a draft lunch edit without changing the published event information',async()=>{
  const values={title:`QA-${nonce} unpublished lunch`,event_date:'2026-10-07',category:'Lunch',description:'Synthetic unpublished test',location:'QA only',hours:'Test only',dietary_info:'',directions_url:'',image_url:'',menu_url:'',sort_order:99990,published:false,is_demo:true};
  const result=await checkJson(await organizer.context.request.post(site+'/api/admin/content/lunch_locations',{headers:{Origin:site},data:{values}}),'Draft lunch save');
  state.records.push({table:'lunch_locations',id:result.record.id});await saveState();
  const rows=await checkJson(await organizer.context.request.get(site+'/api/admin/content/lunch_locations'),'Draft lunch reload');assert.ok(rows.rows.some(r=>r.id===result.record.id));
  const guide=await(await fetch(site+'/api/guide')).json();assert.ok(!guide.lunches.some(r=>r.id===result.record.id));
 });
 await run('Actual public site contains source program, day-specific lunches, ads and no notifications',async()=>{
  const guide=await(await fetch(site+'/api/guide')).json();assert.equal(guide.sessions.length,49);assert.equal(guide.lunches.length,16);assert.equal(guide.placements.length,6);assert.equal(guide.sponsors.length,37);assert.equal(guide.communityEnabled,true);assert.equal(guide.announcements.length,0);assert.equal(guide.activities.length,0);
  const page=organizer.page;
  for(const route of ['/','/agenda','/sponsors','/more/lunch','/more/fun-stuff']){await page.goto(site+route);await expect(page.locator('h1')).toBeVisible();assert.equal(await page.locator('a[href="/more/notifications"]').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.goto(site+'/more/lunch');await expect(page.getByText('Cumberland K (downstairs)',{exact:true}).first()).toBeVisible();await page.screenshot({path:'test-results/live-hub/lunch-desktop.png',fullPage:true});
  await alice.page.goto(site+'/more/lunch');await alice.page.screenshot({path:'test-results/live-hub/lunch-phone.png',fullPage:true});
 });
}catch(error){failure=error;console.error(JSON.stringify({failed:true,error:error.message}));if(debugPage)await debugPage.screenshot({path:'test-results/live-hub/failure.png',fullPage:true}).catch(()=>{});}
finally{
 if(browser)await browser.close();
 try{
  const ids=state.users.map(u=>u.attendee).filter(Boolean);assert.ok(ids.every(id=>/^[a-f0-9-]{36}$/.test(id)));
  if(ids.length){const list=ids.map(id=>`'${id}'::uuid`).join(',');
   query(`begin;
    delete from public.feed_reports where event_id='${EVENT_ID}' and (reporter_id in(${list}) or post_id in(select id from public.feed_posts where event_id='${EVENT_ID}' and author_id in(${list})));
    delete from public.feed_posts where event_id='${EVENT_ID}' and author_id in(${list});
    delete from public.reports where event_id='${EVENT_ID}' and (reporter_id in(${list}) or target_id in(${list}));
    delete from public.messages where event_id='${EVENT_ID}' and conversation_id in(select id from public.conversations where event_id='${EVENT_ID}' and (attendee_a in(${list}) or attendee_b in(${list})));
    delete from public.conversations where event_id='${EVENT_ID}' and (attendee_a in(${list}) or attendee_b in(${list}));
    delete from public.blocks where event_id='${EVENT_ID}' and (blocker_id in(${list}) or blocked_id in(${list}));
    delete from public.saved_attendees where event_id='${EVENT_ID}' and (attendee_id in(${list}) or target_id in(${list}));
    delete from public.attendees where event_id='${EVENT_ID}' and id in(${list}) and registration_email like 'event-beast-hub-qa-%@example.test';
    commit;`);
  }
  for(const row of state.records){assert.equal(row.table,'lunch_locations');checked(await admin.from(row.table).delete().eq('event_id',EVENT_ID).eq('id',row.id),'Remove synthetic row');}
  for(const user of state.users){assert.ok(user.email.startsWith('event-beast-hub-qa-')&&user.email.endsWith('@example.test'));const stored=checked(await admin.auth.admin.getUserById(user.id),'Check synthetic cleanup').user;assert.equal(stored.email,user.email);checked(await admin.auth.admin.deleteUser(user.id),'Remove synthetic identity');}
  state.cleanedUp=true;await saveState();
 }catch(error){failure=error;console.error(JSON.stringify({cleanupFailed:true,message:error.message}));}
 const report={testedAt:new Date().toISOString(),site,project:PROJECT_REF,revision:release?.revision,passed:!failure,checks:results,syntheticUsers:state.users.length,cleanedUp:state.cleanedUp,realSoniaOrDonIdentityUsed:false,automaticEmailDeliveryTested:false,physicalDeviceTested:false};
 await writeFile('docs/september-30-hosted-qualification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:!failure,checks:results.length,cleanedUp:state.cleanedUp}));
 if(failure)process.exitCode=1;
}
