import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';
import { backendAdmin, backendEnvironment, EVENT_ID } from './backend-cli.mjs';

// Explicit, bounded hosted qualification. Never sends mail, never uses an
// existing person's credentials, and cleans only IDs allocated by this run.
const site = 'https://2026live.momentumbuilder.com';
const album = process.argv.includes('--album');
const photoCount = album ? 5 : 1;
const revision = process.argv[process.argv.indexOf('--revision') + 1];
assert.ok(process.argv.includes('--revision') && /^[a-f0-9]{40}$/.test(revision), 'Pass the full expected production commit with --revision.');
assert.ok(process.argv.includes('--run'), 'Hosted writes require --run.');
const release = await (await fetch(site + '/api/release', { cache: 'no-store' })).json();
assert.equal(release.revision, revision); assert.equal(release.emailSignupOpen, true);
const admin = backendAdmin(), env = backendEnvironment(), nonce = randomUUID().slice(0,8);
const report = { revision, startedAt: new Date().toISOString(), checks: [], cleanup: { completed: false, errors: [] } };
const accounts = [], postIds = [], photoPaths = [];
let browser;
const check = name => { report.checks.push({ name, passed: true }); console.log(JSON.stringify({ check: name, passed: true })); };
const validate = (result, label) => { if (result.error) throw new Error(label + ': ' + result.error.message); return result.data; };
async function api(context, path, method='GET', data) {
  const response = await context.request.fetch(site + path, { method, headers: method==='GET' ? {} : { Origin: site }, ...(data === undefined ? {} : { data }) });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok(), `${method} ${path} failed (${response.status()}): ${body.error ?? ''}`);
  return body;
}
async function account(label, role='member') {
  const email = `qa-wall-${nonce}-${label}@example.test`;
  const link = validate(await admin.auth.admin.generateLink({ type: 'magiclink', email }), 'Create disposable identity');
  assert.equal(link.user.email, email);
  const record = { userId: link.user.id, email, attendeeId: null };
  accounts.push(record);
  if (role==='admin') {
    const row = validate(await admin.from('attendees').insert({ event_id: EVENT_ID, registration_email: email, registration_name: 'Temporary wall QA organizer', access_role: 'admin', status: 'approved', directory_allowed: false }).select('id').single(), 'Create disposable organizer');
    record.attendeeId = row.id;
  }
  let jar = [];
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { path: '/', sameSite: 'lax', secure: true, maxAge: 31536000 },
    cookies: { getAll: () => jar, setAll: values => { for (const item of values) jar = [...jar.filter(prior => prior.name !== item.name), item]; } },
  });
  validate(await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' }), 'Verify disposable identity');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addCookies(jar.filter(item=>item.value).map(item=>({name:item.name,value:item.value,domain:new URL(site).hostname,path:'/',secure:true,httpOnly:false,sameSite:'Lax'})));
  const me = await api(context, '/api/me');
  assert.equal(me.eligible, true); assert.equal(me.role, role);
  record.attendeeId = me.attendeeId;
  return { context, me, record };
}
try {
  browser = await chromium.launch();
  const a = await account('a'), b = await account('b'), organizer = await account('organizer','admin');
  const pageA = await a.context.newPage(), pageB = await b.context.newPage(), pageAdmin = await organizer.context.newPage();
  const caption = `Temporary Social Wall QA ${nonce} — removed after verification`;
  const bytes = await sharp({ create: { width: 2500, height: 1600, channels: 3, background: '#426782' } }).png().toBuffer();
  await pageA.goto(site + '/feed', { waitUntil: 'networkidle' });
  await pageA.getByRole('textbox', { name: 'Share with the event', exact: true }).fill(caption);
  await pageA.locator('.wall-composer:visible').getByLabel('Choose a photo for your post').setInputFiles(Array.from({length:photoCount},(_,i)=>({ name: `qa-photo-${i+1}.png`, mimeType: 'image/png', buffer: bytes })));
  await pageA.waitForFunction(count=>document.querySelectorAll('.wall-photo-preview img').length===count,photoCount);
  const posting = pageA.waitForResponse(response => new URL(response.url()).pathname==='/api/feed' && response.request().method()==='POST');
  await pageA.getByRole('button',{name:'Post',exact:true}).click();
  const createdResponse = await posting, created = await createdResponse.json();
  assert.ok(createdResponse.ok(), 'Photo post must persist'); postIds.push(created.id);
  const post = validate(await admin.from('feed_posts').select('id,image_path,photo_count,client_id,body,version').eq('event_id',EVENT_ID).eq('id',created.id).single(), 'Read only the new QA post');
  assert.equal(post.photo_count,photoCount);
  for(let slot=1;slot<=photoCount;slot++)photoPaths.push(slot===1?post.image_path:post.image_path.replace(/\.webp$/,`-${slot}.webp`));
  assert.ok(post.image_path.startsWith(`${EVENT_ID}/${a.me.attendeeId}/`));
  const retry = await api(a.context, '/api/feed', 'POST', { clientId: post.client_id, body: caption, ...(album?{photoCount}:{image:true}) });
  assert.equal(retry.id, post.id);
  check('Actual browser photo upload and retry-safe publication');
  await pageB.goto(site + '/feed', { waitUntil: 'networkidle' });
  const card = pageB.locator('.wall-post').filter({ hasText: caption });
  await card.waitFor();
  await card.locator('.wall-photo img').waitFor();
  await pageB.waitForFunction(id => { const image = document.querySelector(`button[aria-controls="replies-${id}"]`)?.closest('.wall-post')?.querySelector('.wall-photo img'); return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0; }, post.id);
  const photoResponse = await b.context.request.get(site + `/api/feed/${post.id}/photo`);
  assert.equal(photoResponse.status(),200); assert.match(photoResponse.headers()['cache-control'],/no-store/);
  if(album){
    for(let slot=1;slot<=5;slot++){
      const response=await b.context.request.get(site+`/api/feed/${post.id}/photo?slot=${slot}`);
      assert.equal(response.status(),200);const bytes=await response.body();assert.ok(bytes.length<=1024*1024);
      const metadata=await sharp(bytes).metadata();assert.ok(metadata.width<=1920&&metadata.height<=1920);
    }
    assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/photo?slot=6`)).status(),400);
    await card.getByRole('button',{name:'Next photo',exact:true}).click();
    await card.getByText('Photo 2 of 5',{exact:true}).waitFor();
    check('Five hosted bounded photos, album navigation and over-limit refusal');
  }
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(site+`/api/feed/${post.id}/photo?slot=${photoCount}`)).status(),401);
  await anonymous.close();
  check('Second Member sees authenticated photo; anonymous access is denied');
  await card.getByRole('button',{name:'Like 0',exact:true}).click();
  await card.getByRole('button',{name:'Liked 1',exact:true}).waitFor();
  await api(b.context,`/api/feed/${post.id}/like`,'PUT',{liked:true});
  const likes = validate(await admin.from('feed_likes').select('attendee_id').eq('event_id',EVENT_ID).eq('post_id',post.id).eq('attendee_id',b.me.attendeeId),'Read QA like');
  assert.equal(likes.length,1);
  await card.getByRole('button',{name:'Reply 0',exact:true}).click();
  const replyText = `QA reply ${nonce}`;
  await card.getByRole('textbox',{name:'Write a reply'}).fill(replyText);
  const replying = pageB.waitForResponse(response=>new URL(response.url()).pathname===`/api/feed/${post.id}/replies` && response.request().method()==='POST');
  await card.getByRole('button',{name:'Post reply',exact:true}).click();
  const replyResponse = await replying, replyBody = await replyResponse.json(); assert.ok(replyResponse.ok());
  const replyRequest = replyResponse.request().postDataJSON();
  assert.equal((await api(b.context,`/api/feed/${post.id}/replies`,'POST',replyRequest)).id,replyBody.id);
  await pageB.reload({waitUntil:'networkidle'});
  await pageB.locator('.wall-post').filter({hasText:caption}).getByRole('button',{name:'Reply 1',exact:true}).click();
  await pageB.getByText(replyText,{exact:true}).waitFor();
  check('Browser replies and likes persist across reload and retries');
  const forged = await b.context.request.patch(site+`/api/feed/${post.id}`,{headers:{Origin:site},data:{version:post.version,body:'Not my post',remove:false}});
  assert.equal(forged.status(),403);
  await api(a.context,`/api/feed/replies/${replyBody.id}`,'POST',{reason:'Synthetic moderation check'});
  const reports=await api(organizer.context,'/api/admin/feed/replies');
  const replyReport=reports.reports.find(item=>item.reply_id===replyBody.id);assert.ok(replyReport);
  await pageAdmin.goto(site+'/admin/feed',{waitUntil:'networkidle'});
  const reportCard=pageAdmin.locator('.wall-reply-moderation .report-card').filter({hasText:replyText}).filter({hasText:'Open reply report'});
  await reportCard.getByRole('button',{name:'Hide reply & resolve'}).click();
  await reportCard.waitFor({state:'detached'});
  assert.equal((await api(a.context,`/api/feed/${post.id}/replies`)).replies.some(item=>item.id===replyBody.id),false);
  const overwrite=await b.context.request.patch(site+`/api/feed/replies/${replyBody.id}`,{headers:{Origin:site},data:{version:1,body:'Cannot unhide',remove:false}});assert.equal(overwrite.status(),403);
  await api(organizer.context,'/api/admin/feed/replies','PATCH',{replyId:replyBody.id,status:'visible'});
  await api(organizer.context,'/api/admin/feed','PATCH',{postId:post.id,status:'hidden'});
  assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/photo`)).status(),404);
  if(album)assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/photo?slot=5`)).status(),404);
  assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/replies`)).status(),404);
  assert.equal((await b.context.request.put(site+`/api/feed/${post.id}/like`,{headers:{Origin:site},data:{liked:true}})).status(),403);
  await api(organizer.context,'/api/admin/feed','PATCH',{postId:post.id,status:'visible'});
  assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/photo`)).status(),200);
  check('Real organizer reply moderation and parent photo/thread withdrawal');
  await api(a.context,'/api/moderation','POST',{action:'block',target:b.me.attendeeId,blocked:true});
  assert.equal((await b.context.request.get(site+`/api/feed/${post.id}/photo?slot=${photoCount}`)).status(),404);
  await api(a.context,'/api/moderation','POST',{action:'block',target:b.me.attendeeId,blocked:false});
  validate(await admin.from('attendees').update({status:'disabled'}).eq('event_id',EVENT_ID).eq('id',b.me.attendeeId),'Disable only QA Member');
  assert.equal((await b.context.request.get(site+'/api/feed')).status(),403);
  validate(await admin.from('attendees').update({status:'approved'}).eq('event_id',EVENT_ID).eq('id',b.me.attendeeId),'Restore only QA Member');
  check('Hosted block and disabled-account media/feed boundaries');
  const otherTab=await a.context.newPage();await otherTab.goto(site+'/feed',{waitUntil:'networkidle'});
  await pageA.goto(site+'/more',{waitUntil:'networkidle'});
  await pageA.locator('.account-actions').getByRole('button',{name:'Sign out',exact:true}).click();
  await pageA.waitForURL(/\/auth\?force=1&signedOut=1$/);await otherTab.waitForURL(/\/auth\?force=1&signedOut=1$/);
  assert.equal((await api(a.context,'/api/me')).authenticated,false);
  assert.equal((await a.context.request.get(site+'/api/feed')).status(),401);
  assert.equal((await a.context.request.get(site+`/api/feed/${post.id}/photo?slot=${photoCount}`)).status(),401);
  assert.equal((await api(b.context,'/api/me')).eligible,true);
  check('Real sign-out clears cookies, private access and the other open tab');
} catch(error) {
  report.failure=error instanceof Error?error.message:String(error);process.exitCode=1;
} finally {
  await browser?.close();
  const clean=async(label,operation)=>{try{await operation();}catch(error){report.cleanup.errors.push(label+': '+(error instanceof Error?error.message:String(error)));process.exitCode=1;}};
  await clean('Find all QA memberships',async()=>{
    if(!accounts.length)return;
    const rows=validate(await admin.from('attendees').select('id,registration_email').eq('event_id',EVENT_ID).in('registration_email',accounts.map(item=>item.email)),'Resolve only QA membership ids');
    for(const row of rows){const account=accounts.find(item=>item.email===row.registration_email);if(account)account.attendeeId=row.id;}
  });
  await clean('Find staged QA photos',async()=>{
    for(const account of accounts.filter(item=>item.attendeeId)){
      const prefix=`${EVENT_ID}/${account.attendeeId}`;
      const files=validate(await admin.storage.from('event-feed-photos').list(prefix,{limit:200}),'List only this run\'s photo folder');
      for(const file of files){if(/^[a-f0-9-]{36}(-[2-5])?\.webp$/.test(file.name)){const path=prefix+'/'+file.name;if(!photoPaths.includes(path))photoPaths.push(path);}}
    }
  });
  await clean('QA posts',async()=>{if(postIds.length)validate(await admin.from('feed_posts').delete().eq('event_id',EVENT_ID).in('id',postIds),'Delete only QA posts');});
  await clean('QA photos',async()=>{if(photoPaths.length)validate(await admin.storage.from('event-feed-photos').remove(photoPaths),'Remove only QA Storage objects');});
  const attendees=accounts.map(item=>item.attendeeId).filter(Boolean);
  await clean('QA blocks',async()=>{if(attendees.length){validate(await admin.from('blocks').delete().eq('event_id',EVENT_ID).in('blocker_id',attendees),'Remove QA blocks');validate(await admin.from('blocks').delete().eq('event_id',EVENT_ID).in('blocked_id',attendees),'Remove reverse QA blocks');}});
  await clean('QA attendees',async()=>{if(attendees.length)validate(await admin.from('attendees').delete().eq('event_id',EVENT_ID).in('id',attendees),'Remove QA memberships');});
  for(const account of accounts)await clean('QA Auth identity',async()=>{const user=validate(await admin.auth.admin.getUserById(account.userId),'Check identity before cleanup');assert.equal(user.user.email,account.email);validate(await admin.auth.admin.deleteUser(account.userId),'Delete only QA identity');});
  report.cleanup.completed=report.cleanup.errors.length===0;
  report.completedAt=new Date().toISOString();
  const output=album?'test-results/photo-albums-live':'test-results/social-wall-live';
  await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
