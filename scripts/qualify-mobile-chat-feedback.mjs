import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { backendAdmin, EVENT_ID, PROJECT_REF, query } from './backend-cli.mjs';

// Actual deployed Auth/HTTP/Storage/Realtime qualification, never a real user's
// session. State is private and exact synthetic records are removed on failure.
const site='https://event-beast.vercel.app';
const admin=backendAdmin();
const statePath='supabase/.temp/mobile-chat-qualification.json';
const previous=JSON.parse(await readFile(statePath,'utf8').catch(()=> 'null'));
assert.ok(!previous || previous.cleanedUp,'Inspect the prior synthetic cohort before running another.');
const state={users:[],uploads:[],cleanedUp:false};
const save=()=>writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});
await mkdir('test-results/live-chat-feedback',{recursive:true});await save();
const checked=(response,label)=>{if(response.error)throw new Error(label+': '+response.error.message);return response.data;};
const readJson=async(response,label)=>{const result=await response.json();assert.ok(response.ok(),`${label}: HTTP ${response.status()} ${result.error||''}`);return result;};
const checks=[];const run=async(name,action)=>{await action();checks.push({name,passed:true});console.log(JSON.stringify(checks.at(-1)));};
let browser,failed,release;
const nonce=randomUUID().slice(0,8);
try{
  release=await(await fetch(site+'/api/release')).json();assert.equal(release.mode,'live');
  browser=await chromium.launch();
  const create=async(label)=>{
    const email=`event-beast-chat-qa-${label}-${nonce}@example.test`,password=`Test-${randomUUID()}-aA!`;
    const identity=checked(await admin.auth.admin.generateLink({type:'invite',email,options:{redirectTo:site+'/reset-password'}}),'Synthetic invite');
    const user={id:identity.user.id,email,label};state.users.push(user);await save();
    const registration=checked(await admin.from('attendees').insert({event_id:EVENT_ID,registration_email:email,registration_name:`QA ${label} ${nonce}`,access_role:'member',status:'approved',directory_allowed:true}).select('id').single(),'Synthetic member');
    user.attendee=registration.id;await save();
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    const link=new URL('/auth/confirm',site);link.searchParams.set('token_hash',identity.properties.hashed_token);link.searchParams.set('type','invite');
    await page.goto(link.toString());await page.getByRole('button',{name:'Continue securely',exact:true}).click();await page.waitForURL('**/reset-password');
    await page.locator('input[autocomplete="new-password"]').first().fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Update password'}).click();await page.waitForURL('**/more/profile');
    const me=await readJson(await context.request.get(site+'/api/me'),'Own identity');assert.equal(me.attendeeId,user.attendee);assert.equal(me.isAdmin,false);
    const image=await readFile('public/icons/icon-192.png');
    const upload=await readJson(await context.request.post(site+'/api/uploads',{headers:{Origin:site},multipart:{kind:'headshot',file:{name:'synthetic-icon.png',mimeType:'image/png',buffer:image}}}),'Own headshot upload');
    state.uploads.push(upload.path);await save();
    const profile={full_name:`QA ${label} ${nonce}`,company:'Synthetic mobile QA',title:'Test account',city:'',state:'',bio:'Temporary qualification only',interests:[],directory_visible:true,messaging_available:true,headshot_path:upload.path};
    await readJson(await context.request.patch(site+'/api/profile',{headers:{Origin:site},data:profile}),'Profile opt-in');
    return {...user,context,page,profile};
  };
  let alice,bob,post,conversation;
  await run('Two synthetic verified Members can upload and save their own private headshots',async()=>{alice=await create('alice');bob=await create('bob');});
  await run('Feed and direct-chat header resolve actual authorized signed profile images',async()=>{
    post=await readJson(await alice.context.request.post(site+'/api/feed',{headers:{Origin:site},data:{clientId:randomUUID(),body:`QA ${nonce}: avatar verification`}}),'Synthetic wall post');
    const feed=await readJson(await bob.context.request.get(site+'/api/feed'),'Feed projection');
    const item=feed.posts.find(row=>row.id===post.id);assert.ok(item?.avatar_url);assert.ok(!('headshot_path' in item)&&!('registration_email' in item));
    assert.equal((await fetch(item.avatar_url)).status,200);
    await bob.page.goto(site+'/feed');
    const card=bob.page.locator('.wall-post').filter({hasText:`QA ${nonce}: avatar verification`});
    await expect(card.locator('.avatar img')).toBeVisible();await expect.poll(()=>card.locator('.avatar img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    await expect(bob.page.getByRole('link',{name:'Moderate wall'})).toHaveCount(0);
    await bob.page.screenshot({path:'test-results/live-chat-feedback/feed-photo.png'});
    conversation=await readJson(await alice.context.request.post(site+'/api/inbox',{headers:{Origin:site},data:{recipient:bob.attendee}}),'Open synthetic conversation');
    const thread=await readJson(await bob.context.request.get(site+'/api/inbox/'+conversation.id),'Thread projection');assert.ok(thread.peer.avatar_url);assert.equal((await fetch(thread.peer.avatar_url)).status,200);
  });
  await run('Profile privacy still removes photo URLs from both surfaces without exposing private contacts',async()=>{
    await readJson(await alice.context.request.patch(site+'/api/profile',{headers:{Origin:site},data:{...alice.profile,directory_visible:false}}),'Hide synthetic directory profile');
    const feed=await readJson(await bob.context.request.get(site+'/api/feed'),'Private author projection');assert.equal(feed.posts.find(row=>row.id===post.id)?.avatar_url,undefined);
    const thread=await readJson(await bob.context.request.get(site+'/api/inbox/'+conversation.id),'Private peer projection');assert.equal(thread.peer.avatar_url,undefined);
    await readJson(await alice.context.request.patch(site+'/api/profile',{headers:{Origin:site},data:alice.profile}),'Restore own consent');
  });
  await run('A real incoming message updates Home badges and an in-app notice without opening Inbox',async()=>{
    const baseline=bob.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/inbox/unread');
    await bob.page.goto(site+'/');assert.equal((await (await baseline).json()).unread,0);
    await expect(bob.page.locator('.message-shortcut')).toHaveAttribute('aria-label','Private messages');
    await bob.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await readJson(await alice.context.request.post(site+'/api/inbox/'+conversation.id,{headers:{Origin:site},data:{client_id:randomUUID(),body:`QA ${nonce}: private arrival`}}),'Send synthetic message');
    // No fake browser event or response interception: real Realtime/polling.
    await expect(bob.page.locator('.message-shortcut')).toHaveAttribute('aria-label','Private messages, 1 unread message',{timeout:35000});
    await expect(bob.page.getByRole('complementary',{name:'New private message'})).toBeVisible();
    assert.equal(new URL(bob.page.url()).pathname,'/');
    await expect(bob.page.locator('a[href="/more/notifications"]')).toHaveCount(0);
    await bob.page.screenshot({path:'test-results/live-chat-feedback/home-unread-message.png'});
  });
  await run('Opening the private message clears unread state and shows the peer photo',async()=>{
    await bob.page.getByRole('link',{name:'Open conversation',exact:true}).click();
    await expect(bob.page.getByText(`QA ${nonce}: private arrival`,{exact:true})).toBeVisible();
    await expect(bob.page.locator('.thread-header .avatar img')).toBeVisible();
    await expect.poll(()=>bob.page.locator('.thread-header .avatar img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    await expect(bob.page.locator('.message-shortcut')).toHaveAttribute('aria-label','Private messages',{timeout:10000});
    const summary=await readJson(await bob.context.request.get(site+'/api/inbox/unread'),'Confirmed read summary');assert.equal(summary.unread,0);
    await bob.page.getByRole('textbox',{name:'Your message',exact:true}).fill('Unsent geometry test');
    await bob.page.getByRole('textbox',{name:'Your message',exact:true}).blur();
    await bob.page.screenshot({path:'test-results/live-chat-feedback/thread-peer-photo.png'});
    assert.ok(await bob.page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
    await bob.page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Home',exact:true}).click();
    await expect(bob.page.locator('html')).not.toHaveAttribute('data-thread-viewport','true');
  });
  await run('Unread API is metadata-only, cannot be read anonymously, and never enters the public cache',async()=>{
    const unauthorized=await fetch(site+'/api/inbox/unread');assert.equal(unauthorized.status,401);assert.ok(unauthorized.headers.get('cache-control').includes('no-store'));
    const summary=await readJson(await bob.context.request.get(site+'/api/inbox/unread'),'Metadata summary');assert.deepEqual(Object.keys(summary).sort(),['conversationId','latestId','unread']);
    const cached=await bob.page.evaluate(async()=>{const urls=[];for(const key of await caches.keys())for(const entry of await(await caches.open(key)).keys())urls.push(new URL(entry.url).pathname);return urls;});
    assert.ok(!cached.some(path=>/^\/api\/(inbox|feed|me|profile)/.test(path)));
    assert.equal((await bob.context.request.get(site+'/api/admin/feed')).status(),403);
  });
}catch(error){failed=error;console.error(JSON.stringify({failed:true,message:error.message}));}
finally{
  if(browser)await browser.close();
  try{
    const ids=state.users.map(user=>user.attendee).filter(Boolean);assert.ok(ids.every(id=>/^[a-f0-9-]{36}$/.test(id)));
    if(ids.length){const list=ids.map(id=>`'${id}'::uuid`).join(',');query(`begin;
      delete from public.feed_reports where event_id='${EVENT_ID}' and (reporter_id in(${list}) or post_id in(select id from public.feed_posts where event_id='${EVENT_ID}' and author_id in(${list})));
      delete from public.feed_posts where event_id='${EVENT_ID}' and author_id in(${list});
      delete from public.reports where event_id='${EVENT_ID}' and (reporter_id in(${list}) or target_id in(${list}));
      delete from public.messages where event_id='${EVENT_ID}' and conversation_id in(select id from public.conversations where event_id='${EVENT_ID}' and (attendee_a in(${list}) or attendee_b in(${list})));
      delete from public.conversations where event_id='${EVENT_ID}' and (attendee_a in(${list}) or attendee_b in(${list}));
      delete from public.blocks where event_id='${EVENT_ID}' and (blocker_id in(${list}) or blocked_id in(${list}));
      delete from public.saved_attendees where event_id='${EVENT_ID}' and (attendee_id in(${list}) or target_id in(${list}));
      delete from public.attendees where event_id='${EVENT_ID}' and id in(${list}) and registration_email like 'event-beast-chat-qa-%@example.test';
      commit;`);}
    if(state.uploads.length){assert.ok(state.uploads.every(path=>state.users.some(user=>path.startsWith(`${EVENT_ID}/${user.attendee}/`))));checked(await admin.storage.from('event-headshots').remove(state.uploads),'Remove synthetic images');}
    for(const user of state.users){assert.ok(user.email.startsWith('event-beast-chat-qa-')&&user.email.endsWith('@example.test'));assert.equal(checked(await admin.auth.admin.getUserById(user.id),'Cleanup identity').user.email,user.email);checked(await admin.auth.admin.deleteUser(user.id),'Remove synthetic user');}
    state.cleanedUp=true;await save();
  }catch(error){failed=error;console.error(JSON.stringify({cleanupFailed:true,message:error.message}));}
  const result={testedAt:new Date().toISOString(),project:PROJECT_REF,revision:release?.revision,site,passed:!failed,checks,syntheticAccounts:state.users.length,cleanedUp:state.cleanedUp,realAttendeeMessagesChanged:false,physicalKeyboardTested:false,nativePushEnabled:false,automaticEmailsSent:0};
  await writeFile('docs/mobile-chat-hosted-qualification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:!failed,checks:checks.length,cleanedUp:state.cleanedUp}));
  if(failed)process.exitCode=1;
}
