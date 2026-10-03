import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide, demoMe } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';
import type { FeedPost } from '../../src/lib/types';
test.use({ serviceWorkers:'block' });

test('social wall retains a failed draft, retries idempotently, edits and removes an own post',async({page},info)=>{
 const guide={...publicSiteGuide(demoGuide,true),mode:'live'};
 const member={...demoMe,mode:'live',authenticated:true,eligible:true,attendeeId:'71000000-0000-4000-8000-000000000077'};
 let posts:FeedPost[]=[],fail=true;
 const clients:string[]=[];
 await page.route('**/api/guide',r=>r.fulfill({json:guide}));
 await page.route('**/api/me',r=>r.fulfill({json:member}));
 await page.route('**/api/saved',r=>r.fulfill({json:{sessions:[],attendees:[]}}));
 await page.route('**/api/feed**',async route=>{
  const method=route.request().method(), path=new URL(route.request().url()).pathname;
  if(method==='GET')return route.fulfill({json:{posts:posts.filter(p=>p.status==='visible'),nextCursor:null}});
  const data=route.request().postDataJSON();
  if(method==='POST'&&path==='/api/feed'){
   clients.push(data.clientId);
   if(!posts.length)posts=[{id:'71000000-0000-4000-8000-000000000042',author_id:member.attendeeId,author_name:'Testing attendee',body:data.body,status:'visible',version:0,created_at:'2026-10-06T18:00:00Z',updated_at:'2026-10-06T18:00:00Z'}];
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Synthetic response lost after persistence'}});}
   return route.fulfill({json:{saved:true,id:posts[0].id}});
  }
  if(method==='PATCH'){posts=posts.map(p=>({...p,body:data.body,status:data.remove?'deleted':'visible',version:p.version+1}));return route.fulfill({json:{saved:true}});}
  return route.fulfill({json:{saved:true}});
 });
 await page.goto('/feed');
 await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.demo-strip').count();}).toBe(0);
 // Next/React may retain an inactive form in a hidden Activity during refresh.
 // Interact with the accessible, visible textbox rather than hidden labels.
 const composer=page.getByRole('textbox',{name:'Share with the event',exact:true});
 await composer.fill('A real takeaway from the test');
 await page.getByRole('button',{name:'Post',exact:true}).click();
 await expect(page.locator('.toast[role="alert"]')).toContainText('draft is retained');
 await expect(composer).toHaveValue('A real takeaway from the test');
 await page.getByRole('button',{name:'Post',exact:true}).click();
 await expect(page.locator('.wall-post')).toHaveCount(1); expect(clients).toHaveLength(2);expect(clients[0]).toBe(clients[1]);
 await page.locator('.wall-post').getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Post text').fill('Revised takeaway');
 await page.getByRole('button',{name:'Save post',exact:true}).click();
 await expect(page.locator('.wall-body')).toHaveText('Revised takeaway');
 await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0,0); });
 await page.screenshot({path:info.outputPath('social-wall.png'),fullPage:true});
 expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
 await page.locator('.wall-post').getByRole('button',{name:'Remove',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Remove post',exact:true}).click();
 await expect(page.locator('.wall-post')).toHaveCount(0);
});

test('attendee reports a post and organizer can hide and resolve it',async({page})=>{
 const post:FeedPost={id:'71000000-0000-4000-8000-000000000043',author_id:'71000000-0000-4000-8000-000000000099',author_name:'Another attendee',body:'A post for moderation',status:'visible',version:0,created_at:'2026-10-06T18:00:00Z',updated_at:'2026-10-06T18:00:00Z'};
 let reported=false,resolved=false;
 await page.route('**/api/feed',r=>r.fulfill({json:{posts:[post],nextCursor:null}}));
 await page.route('**/api/feed/*',async r=>{reported=true;expect(r.request().postDataJSON()).toEqual({reason:'Please review this post'});await r.fulfill({json:{saved:true}});});
 await page.goto('/feed');await page.getByRole('button',{name:'Report',exact:true}).click();
 await page.getByLabel('Reason for reporting').fill('Please review this post');await page.getByRole('button',{name:'Send report'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(reported).toBe(true);
 await page.route('**/api/admin/feed*',async r=>{
  if(r.request().method()==='PATCH'){expect(r.request().postDataJSON()).toMatchObject({postId:post.id,status:'hidden'});post.status='hidden';resolved=true;return r.fulfill({json:{saved:true}});}
  return r.fulfill({json:{posts:[post],reportedPosts:[],reports:resolved?[]:[{id:'71000000-0000-4000-8000-000000000044',post_id:post.id,reason:'Please review this post',status:'open'}],hasMore:false}});
 });
 await page.goto('/admin/feed');await page.getByRole('button',{name:'Hide & resolve'}).click();
 await expect(page.getByText('Open report',{exact:true})).toHaveCount(0);expect(resolved).toBe(true);await expect(page.getByText('hidden',{exact:true})).toBeVisible();
});

test('Lunch owns breakouts; Fun Stuff has its own truthful pending page and no notification UI',async({page},info)=>{
 await page.goto('/more');await expect(page.getByRole('link',{name:/Lunch & breakouts/})).toBeVisible();
 await page.locator('.more-menu').getByRole('link',{name:/Fun Stuff/}).click();
 await expect(page.getByRole('heading',{name:'Fun Stuff.'})).toBeVisible();
 await expect(page.getByText('Sonia is preparing this page.',{exact:false})).toBeVisible();
 expect(await page.locator('a[href="/more/notifications"]').count()).toBe(0);
 await page.screenshot({path:info.outputPath('fun-stuff-pending.png'),fullPage:true});
 expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
});

test('unconfirmed end time is not invented in the visible session range',async({page})=>{
 const guide=publicSiteGuide(structuredClone(demoGuide),true);
 guide.sessions[0].end_time_confirmed=false;
 await page.route('**/api/guide',r=>r.fulfill({json:guide}));
 await page.goto('/agenda/'+guide.sessions[0].id);
 await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.detail-facts:visible').innerText();}).not.toContain(' – ');
});

test('email confirmation GET is a safe landing with no passive token consumption',async({page,request})=>{
 const url='/auth/confirm?token_hash='+'a'.repeat(64)+'&type=invite';
 const first=await request.get(url,{maxRedirects:0});expect(first.status()).toBe(200);expect(first.headers()['cache-control']).toContain('no-store');
 await page.goto(url);await expect(page.getByRole('button',{name:'Continue securely'})).toBeVisible();
 await expect(page).toHaveURL(/\/auth\/confirm\?/);
 await expect(page.getByText('Opening this page does not use your link.',{exact:false})).toBeVisible();
});

test('confirmation form preserves its Origin without leaking the token in Referer',async({page},info)=>{
 const origin=new URL(String(info.project.use.baseURL)).origin;
 await page.goto('/auth/confirm?token_hash='+'b'.repeat(64)+'&type=invite');
 const submitted=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/auth/confirm');
 await page.getByRole('button',{name:'Continue securely',exact:true}).click();
 const request=await submitted;
 const headers=await request.allHeaders();
 expect(headers.origin).toBe(origin);
 expect(headers.referer).toBe(origin+'/');
 expect(headers.referer).not.toContain('token_hash');
 expect((await request.response())?.status()).not.toBe(403);
});
