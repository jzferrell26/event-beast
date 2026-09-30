import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {backendAdmin,EVENT_ID,PROJECT_REF,query} from './backend-cli.mjs';

// Real deployed HTTP/Auth/Storage qualification. Only synthetic identities and
// unpublished rows are created; no real person's identity or password is used.
const site='https://event-beast.vercel.app';
const admin=backendAdmin();
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const stateFile='supabase/.temp/live-organizer-qa.json';
await mkdir('test-results/live-organizer',{recursive:true});
const prior=JSON.parse(await readFile(stateFile,'utf8').catch(()=>'null'));
if(prior && !prior.cleanedUp)throw new Error('Clean up the recorded synthetic cohort before running again');
const state={project:PROJECT_REF,event:EVENT_ID,users:[],records:[],uploads:[],cleanedUp:false};
const persist=()=>writeFile(stateFile,JSON.stringify(state,null,2),{mode:0o600});
await persist();
const checks=[];
let browser;
let failure;
let testedRevision = null;
const run=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(JSON.stringify(checks.at(-1)));};
const responseJson=async(response,label)=>{const data=await response.json();assert.ok(response.ok(),`${label}: HTTP ${response.status()} ${data.error||''}`);return data;};
const values={
 speakers:{full_name:'',title:'Synthetic qualification only',bio:'Synthetic unpublished organizer verification.',headshot_url:'',source_url:'',published:false,is_demo:true},
 lunch_locations:{title:'',location:'Synthetic unpublished location',hours:'12:00 PM',description:'Synthetic qualification only',dietary_info:'Not event information',directions_url:'',image_url:'',sort_order:99990,published:false,is_demo:true},
};
try {
 const release=await(await fetch(`${site}/api/release`)).json();
 testedRevision = release.revision;
 assert.equal(release.mode,'live');
 const guide=await(await fetch(`${site}/api/guide`)).json();
 assert.equal(guide.event.id,EVENT_ID);assert.equal(guide.publicSite,true);
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const page=await context.newPage();
 const email=`event-beast-qa-${randomUUID()}@example.test`;
 const password=`Test!${randomUUID()}-aA9`;
 const invitation=checked(await admin.auth.admin.generateLink({type:'invite',email,options:{redirectTo:`${site}/reset-password`}}),'Synthetic invitation');
 const user=invitation.user;assert.ok(user && invitation.properties?.hashed_token);assert.ok(!user.email_confirmed_at);
 state.users.push({id:user.id,email});await persist();
 const registration=checked(await admin.from('attendees').insert({event_id:EVENT_ID,registration_email:email,registration_name:'Temporary organizer qualification',access_role:'admin',status:'approved',directory_allowed:false}).select('id').single(),'Synthetic organizer grant');
 state.users[0].attendee=registration.id;await persist();
 await run('Deployed invite verification, password setup and real organizer login',async()=>{
  const activation=new URL('/auth/confirm',site);activation.searchParams.set('token_hash',invitation.properties.hashed_token);activation.searchParams.set('type','invite');activation.searchParams.set('next','/reset-password');
  await page.goto(activation.toString());await page.waitForURL('**/reset-password');
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel('Confirm password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.waitForURL(`${site}/`);
  await page.waitForLoadState('networkidle');
  if (process.env.EVENT_BEAST_QA_PRECLAIM === 'true') {
    // Diagnostic only: qualify the downstream editor while the separate
    // first-render claim fix is being released. Final qualification omits this.
    await responseJson(await context.request.get(`${site}/api/me`), 'Diagnostic claim');
  }
  await page.goto(`${site}/admin`);
  await page.screenshot({path:'test-results/live-organizer/admin-entry.png',fullPage:true});
  await page.getByRole('heading',{name:'Set the event in motion.',exact:true}).waitFor();
  const me=await responseJson(await context.request.get(`${site}/api/me`),'Organizer identity');assert.equal(me.isAdmin,true);
  const confirmed=checked(await admin.auth.admin.getUserById(user.id),'Synthetic verification readback').user;assert.ok(confirmed.email_confirmed_at);
 });
 const save=async(resource,payload)=>responseJson(await context.request.post(`${site}/api/admin/content/${resource}`,{headers:{Origin:site},data:payload}),`Save ${resource}`);
 const register=async(resource,payload)=>{const saved=await save(resource,payload);const record={resource,id:saved.record.id};state.records.push(record);await persist();return record.id;};
 await run('Actual deployed session and speaker assignments persist atomically',async()=>{
  const day=guide.days[0];assert.ok(day && guide.speakers[0]);
  const base={day_id:day.id,title:`000 QA session ${randomUUID().slice(0,8)}`,description:'Synthetic unpublished qualification',starts_at:`${day.date}T12:00:00Z`,ends_at:`${day.date}T12:30:00Z`,room:'QA only',session_type:'Session',sponsor_id:null,published:false,is_demo:true};
  const id=await register('agenda_sessions',{values:base,speaker_ids:[guide.speakers[0].id]});
  await page.goto(`${site}/admin/agenda_sessions`);
  const row=page.locator('.admin-record-list article').filter({has:page.getByRole('heading',{name:base.title,exact:true})});
  await row.getByRole('button',{name:'Edit',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Session title',{exact:false}).fill(`${base.title} revised`);
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('heading',{name:`${base.title} revised`,exact:true}).waitFor();
  const saved=checked(await admin.from('agenda_sessions').select('title,published').eq('id',id).single(),'Session readback');assert.equal(saved.title,`${base.title} revised`);assert.equal(saved.published,false);
  const links=checked(await admin.from('session_speakers').select('speaker_id').eq('session_id',id),'Speaker readback');assert.deepEqual(links,[{speaker_id:guide.speakers[0].id}]);
 });
 let uploadedUrl;
 await run('Actual organizer image decode, storage upload, row patch and reload',async()=>{
  const full_name=`000 QA speaker ${randomUUID().slice(0,8)}`;
  const id=await register('speakers',{values:{...values.speakers,full_name}});
  await page.goto(`${site}/admin/speakers`);
  const response=page.waitForResponse(response=>response.url().endsWith('/api/uploads') && response.request().method()==='POST');
  await page.getByLabel(`Upload photo for ${full_name}`,{exact:true}).setInputFiles('public/icons/icon-192.png');
  const upload=await responseJson(await response,'Actual storage upload');state.uploads.push(upload.path);await persist();uploadedUrl=upload.url;
  await page.getByText('Photo saved.',{exact:true}).waitFor();await page.reload();
  const speaker=checked(await admin.from('speakers').select('headshot_url,published').eq('id',id).single(),'Photo readback');assert.equal(speaker.headshot_url,upload.url);assert.equal(speaker.published,false);
  const asset=await fetch(upload.url);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/webp');
 });
 await run('Real sponsor-ad and lunch edits save and reload without publishing test records',async()=>{
  const headline=`000 QA ad ${randomUUID().slice(0,8)}`;
  const ad=await register('agenda_sponsor_placements',{values:{surface:'home',day_id:null,after_session_id:null,sponsor_id:guide.sponsors[0].id,headline,body:'Synthetic QA only',image_url:uploadedUrl,image_alt:'Synthetic verification image',image_format:'square',link_url:'',sort_order:99990,published:false}});
  const title=`000 QA lunch ${randomUUID().slice(0,8)}`;
  const lunch=await register('lunch_locations',{values:{...values.lunch_locations,title}});
  const gotAd=checked(await admin.from('agenda_sponsor_placements').select('image_url,published,surface').eq('id',ad).single(),'Ad readback');assert.equal(gotAd.image_url,uploadedUrl);assert.equal(gotAd.published,false);
  const gotLunch=checked(await admin.from('lunch_locations').select('title,published').eq('id',lunch).single(),'Lunch readback');assert.equal(gotLunch.title,title);assert.equal(gotLunch.published,false);
  const live=await(await fetch(`${site}/api/guide`)).json();
  assert.ok(!JSON.stringify(live).includes(headline));assert.ok(!JSON.stringify(live).includes(title));
 });
 await run('Anonymous and Member users are refused organizer reads, writes and uploads',async()=>{
  const anonymous=await browser.newContext({serviceWorkers:'block'});
  assert.equal((await anonymous.request.get(`${site}/api/admin/users`)).status(),401);
  const memberEmail=`event-beast-qa-${randomUUID()}@example.test`;
  const member=checked(await admin.auth.admin.createUser({email:memberEmail,password,email_confirm:true}),'Synthetic member').user;
  state.users.push({id:member.id,email:memberEmail});await persist();
  const memberRegistration=checked(await admin.from('attendees').insert({event_id:EVENT_ID,registration_name:'Temporary member qualification',registration_email:memberEmail,access_role:'member',status:'approved',directory_allowed:false}).select('id').single(),'Member registration');state.users[1].attendee=memberRegistration.id;await persist();
  await responseJson(await anonymous.request.post(`${site}/api/auth`,{headers:{Origin:site},data:{action:'sign-in',email:memberEmail,password,next:'/admin'}}),'Member login');
  assert.equal((await anonymous.request.get(`${site}/api/admin/users`)).status(),403);
  assert.equal((await anonymous.request.patch(`${site}/api/admin/content/speakers`,{headers:{Origin:site},data:{id:state.records.find(r=>r.resource==='speakers').id,url:uploadedUrl}})).status(),403);
  const png=await readFile('public/icons/icon-192.png');
  assert.equal((await anonymous.request.post(`${site}/api/uploads`,{headers:{Origin:site},multipart:{kind:'asset',file:{name:'test.png',mimeType:'image/png',buffer:png}}})).status(),403);
  await anonymous.close();
 });
 await run('Recovery-token password reset and fresh login work on the deployed site',async()=>{
  const recovery=checked(await admin.auth.admin.generateLink({type:'recovery',email}),'Synthetic recovery');
  const reset=new URL('/auth/confirm',site);reset.searchParams.set('token_hash',recovery.properties.hashed_token);reset.searchParams.set('type','recovery');
  await page.goto(reset.toString());await page.waitForURL('**/reset-password');
  const nextPassword=`Changed!${randomUUID()}-aA9`;
  await page.getByLabel(/^New password/).fill(nextPassword);await page.getByLabel('Confirm password',{exact:true}).fill(nextPassword);await page.getByRole('button',{name:'Update password',exact:true}).click();await page.waitForURL(`${site}/`);
  await responseJson(await context.request.post(`${site}/api/auth`,{headers:{Origin:site},data:{action:'sign-out'}}),'Sign out');
  await responseJson(await context.request.post(`${site}/api/auth`,{headers:{Origin:site},data:{action:'sign-in',email,password:nextPassword,next:'/admin'}}),'Fresh password login');
  await page.goto(`${site}/admin`);await page.getByRole('heading',{name:'Set the event in motion.',exact:true}).waitFor();
 });
 await page.screenshot({path:'test-results/live-organizer/admin-overview.png',fullPage:true});
 await context.close();
}catch(error){failure=error;console.error(JSON.stringify({failed:true,message:error.message}));}
finally{
 try{
  if(browser)await browser.close();
  for(const record of [...state.records].reverse()){
   assert.ok(['agenda_sessions','speakers','agenda_sponsor_placements','lunch_locations'].includes(record.resource));
   checked(await admin.from(record.resource).delete().eq('event_id',EVENT_ID).eq('id',record.id),'Remove synthetic content');
  }
  if(state.uploads.length){assert.ok(state.uploads.every(path=>path.startsWith(`${EVENT_ID}/organizer/`)));checked(await admin.storage.from('event-assets').remove(state.uploads),'Remove synthetic upload');}
  for(const user of state.users){
   assert.ok(user.email.startsWith('event-beast-qa-')&&user.email.endsWith('@example.test'));
   const identity=checked(await admin.auth.admin.getUserById(user.id),'Check cleanup identity').user;assert.equal(identity.email,user.email);
   if(user.attendee)query(`delete from public.attendees where id='${user.attendee}' and event_id='${EVENT_ID}' and registration_email='${user.email}';`);
   checked(await admin.auth.admin.deleteUser(user.id),'Delete synthetic Auth user');
  }
  state.cleanedUp=true;await persist();
 }catch(error){failure=error;console.error(JSON.stringify({cleanupFailed:true,message:error.message}));}
 const report={checkedAt:new Date().toISOString(),project:PROJECT_REF,site,testedRevision,passed:!failure,checks,syntheticUsers:state.users.length,cleanedUp:state.cleanedUp,firstRenderClaimTested:process.env.EVENT_BEAST_QA_PRECLAIM!=='true',realHttpAuthAndStorage:true,realSoniaLoginTested:false,emailDeliveryTested:false,realPublishedContentAltered:false};
 await writeFile('docs/live-organizer-qualification.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:!failure,checks:checks.length,cleanedUp:state.cleanedUp}));
 if(failure)process.exitCode=1;
}
