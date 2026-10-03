import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { demoGuide, demoMe } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';
import type { FeedPost, FeedReply } from '../../src/lib/types';
test.use({serviceWorkers:'block'});

async function fixture(context:BrowserContext, {lostResponses=false,replyRows=0}={}) {
  const guide={...publicSiteGuide(structuredClone(demoGuide),true),mode:'live'};
  guide.settings.announcements_enabled=false;
  const member={...demoMe,mode:'live',authenticated:true,eligible:true,isAdmin:false,attendeeId:'71000000-0000-4000-8000-000000000077'};
  const postId='71000000-0000-4000-8000-000000000042';
  let posts:FeedPost[]=[],replies:FeedReply[]=[],signedIn=true,failUpload=lostResponses,failPost=lostResponses,failLike=lostResponses,failReply=lostResponses,failSignOut=false;
  const uploadKeys:string[]=[],postKeys:string[]=[],replyKeys:string[]=[],likes:boolean[]=[];
  const image=await sharp({create:{width:2400,height:1200,channels:3,background:'#447788'}}).png().toBuffer();
  const seed=()=>{posts=[{id:postId,author_id:member.attendeeId,author_name:'Testing attendee',body:'A moment worth sharing',status:'visible',version:0,created_at:'2026-10-06T18:00:00Z',updated_at:'2026-10-06T18:00:00Z',image_url:`/api/feed/${postId}/photo`,like_count:0,liked_by_me:false,reply_count:replyRows}];};
  if(replyRows){seed();replies=Array.from({length:replyRows},(_,i)=>({id:`72000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,post_id:postId,author_id:'71000000-0000-4000-8000-000000000099',author_name:'Another attendee',body:'Reply number '+(i+1),status:'visible' as const,version:0,created_at:new Date(Date.parse('2026-10-06T18:00:00Z')+i*1000).toISOString(),updated_at:'2026-10-06T18:00:00Z'}));}
  await context.route('**/api/guide',r=>r.fulfill({json:guide}));
  await context.route('**/api/me',r=>r.fulfill({json:signedIn?member:{...member,authenticated:false,eligible:false,isAdmin:false,attendeeId:null,profile:null}}));
  await context.route('**/api/saved',r=>r.fulfill({json:{sessions:[],attendees:[]}}));
  await context.route('**/api/inbox/unread',r=>r.fulfill({json:{unreadCount:0}}));
  await context.route('**/api/auth',async r=>{
    if(r.request().postDataJSON().action==='sign-out'){
      if(failSignOut)return r.fulfill({status:503,json:{error:'Sign-out was not confirmed. Please try again.'}});
      signedIn=false;return r.fulfill({json:{next:'/auth'}});
    }return r.fulfill({json:{}});
  });
  await context.route('**/api/feed**',async r=>{
    const req=r.request(),method=req.method(),url=new URL(req.url()),path=url.pathname;
    if(!signedIn)return r.fulfill({status:401,json:{error:'Please sign in.'}});
    if(method==='GET'&&path.endsWith('/photo'))return r.fulfill({contentType:'image/png',body:image,headers:{'Cache-Control':'private, no-store'}});
    if(path==='/api/feed/photos'){
      if(method==='DELETE')return r.fulfill({json:{removed:true}});
      const key=req.postData()?.match(/name="clientId"\r?\n\r?\n([^\r\n]+)/)?.[1];expect(key).toBeTruthy();uploadKeys.push(key!);
      if(failUpload){failUpload=false;return r.fulfill({status:503,json:{error:'Synthetic response lost after upload'}});}
      return r.fulfill({json:{uploaded:true,clientId:key}});
    }
    if(path==='/api/feed'){
      if(method==='GET')return r.fulfill({json:{posts:posts.filter(p=>p.status==='visible'),nextCursor:null}});
      const data=req.postDataJSON();postKeys.push(data.clientId);
      if(!posts.length){seed();posts[0].body=data.body;posts[0].image_url=data.image?`/api/feed/${postId}/photo`:null;}
      if(failPost){failPost=false;return r.fulfill({status:503,json:{error:'Synthetic post response lost'}});}
      return r.fulfill({json:{saved:true,id:postId}});
    }
    if(path.endsWith('/like')){
      const desired=req.postDataJSON().liked;likes.push(desired);posts[0].liked_by_me=desired;posts[0].like_count=desired?1:0;
      if(failLike){failLike=false;return r.fulfill({status:503,json:{error:'Synthetic like response lost'}});}
      return r.fulfill({json:{saved:true,like_count:posts[0].like_count,liked_by_me:desired}});
    }
    if(path===`/api/feed/${postId}/replies`){
      if(method==='GET'){
        const sorted=replies.filter(reply=>reply.status==='visible').sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
        const cursor=url.searchParams.get('cursor'),offset=cursor?sorted.findIndex(reply=>reply.id===cursor)+1:0;
        const page=sorted.slice(offset,offset+30);return r.fulfill({json:{replies:page,nextCursor:sorted.length>offset+30?page.at(-1)!.id:null}});
      }
      const data=req.postDataJSON();
      if(!replyKeys.includes(data.clientId)){replies.push({id:'72000000-0000-4000-8000-000000000042',post_id:postId,author_id:member.attendeeId,author_name:'Testing attendee',body:data.body,status:'visible',version:0,created_at:'2026-10-07T18:01:00Z',updated_at:'2026-10-07T18:01:00Z'});posts[0].reply_count=replies.length;}
      replyKeys.push(data.clientId);
      if(failReply){failReply=false;return r.fulfill({status:503,json:{error:'Synthetic reply response lost'}});}
      return r.fulfill({json:{saved:true,id:replies.at(-1)!.id}});
    }
    if(path.startsWith('/api/feed/replies/')&&method==='PATCH'){
      const data=req.postDataJSON();replies=replies.map(reply=>reply.id===path.split('/').at(-1)?{...reply,body:data.body,status:data.remove?'deleted':'visible',version:reply.version+1}:reply);posts[0].reply_count=replies.filter(reply=>reply.status==='visible').length;return r.fulfill({json:{saved:true}});
    }
    return r.fulfill({json:{saved:true}});
  });
  return {image,uploadKeys,postKeys,replyKeys,likes,seed,failLogout:(value:boolean)=>{failSignOut=value;}};
}

test('photo-only post, lost-response retries, replies and likes are usable on a phone',async({page,context},info)=>{
  const f=await fixture(context,{lostResponses:true});await page.goto('/feed');
  await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.demo-strip').count();}).toBe(0);
  await page.locator('.wall-composer:visible').getByLabel('Choose a photo for your post').setInputFiles({name:'camera.png',mimeType:'image/png',buffer:f.image});
  await expect(page.getByAltText('Your selected photo preview')).toBeVisible();
  await page.getByRole('button',{name:'Post',exact:true}).click();
  await expect(page.locator('.wall-composer [role="alert"]')).toContainText('draft is retained');
  await page.getByRole('button',{name:'Post',exact:true}).click();
  await expect(page.locator('.wall-composer [role="alert"]')).toContainText('Synthetic post response lost');
  await page.getByRole('button',{name:'Post',exact:true}).click();
  await expect(page.locator('.wall-post')).toHaveCount(1);expect(f.uploadKeys).toHaveLength(2);expect(new Set(f.uploadKeys).size).toBe(1);expect(new Set(f.postKeys).size).toBe(1);
  await expect(page.getByAltText('Your selected photo preview')).toHaveCount(0);
  await page.getByRole('button',{name:'View full photo by Testing attendee'}).click();await expect(page.getByRole('dialog').getByAltText('Full photo shared by Testing attendee')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Like 0',exact:true}).click();await page.getByRole('button',{name:'Retry like 0',exact:true}).click();
  await expect(page.getByRole('button',{name:'Liked 1',exact:true})).toHaveAttribute('aria-pressed','true');expect(f.likes).toEqual([true,true]);
  await page.getByRole('button',{name:'Reply 0',exact:true}).click();await page.getByRole('textbox',{name:'Write a reply'}).fill('What a great session!');await page.getByRole('button',{name:'Post reply',exact:true}).click();
  await expect(page.locator('.wall-thread [role="alert"]')).toContainText('draft is retained');await expect(page.getByRole('textbox',{name:'Write a reply'})).toHaveValue('What a great session!');await page.getByRole('button',{name:'Post reply',exact:true}).click();
  await expect(page.locator('.wall-reply')).toHaveCount(1);expect(f.replyKeys).toHaveLength(2);expect(new Set(f.replyKeys).size).toBe(1);
  await page.getByRole('button',{name:'Edit reply',exact:true}).click();await page.getByRole('textbox',{name:'Reply text'}).fill('Updated takeaway');await page.getByRole('button',{name:'Save reply'}).click();await expect(page.locator('.wall-reply-body')).toHaveText('Updated takeaway');
  await page.evaluate(async()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await page.screenshot({path:info.outputPath('photo-replies-likes.png'),fullPage:true});
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.reload();await expect(page.locator('.wall-post')).toHaveCount(1);await expect(page.getByRole('button',{name:'Liked 1',exact:true})).toBeVisible();await page.getByRole('button',{name:'Reply 1',exact:true}).click();await expect(page.locator('.wall-reply-body')).toHaveText('Updated takeaway');
  await page.getByRole('button',{name:'Remove reply',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Remove reply',exact:true}).click();await expect(page.locator('.wall-reply')).toHaveCount(0);
});

test('reply pagination retains loaded history and a typed draft on refresh',async({page,context})=>{
  await fixture(context,{replyRows:31});await page.goto('/feed');await page.getByRole('button',{name:'Reply 31',exact:true}).click();await expect(page.locator('.wall-reply')).toHaveCount(30);await page.getByRole('button',{name:'Earlier replies'}).click();await expect(page.locator('.wall-reply')).toHaveCount(31);
  await page.getByRole('textbox',{name:'Write a reply'}).fill('Keep this draft');await page.getByRole('button',{name:'Refresh replies'}).click();await expect(page.locator('.wall-reply')).toHaveCount(31);await expect(page.getByRole('textbox',{name:'Write a reply'})).toHaveValue('Keep this draft');
});

test('sign-out is discoverable, does not fake success, and clears other tabs and private views',async({page,context},info)=>{
  const f=await fixture(context);f.seed();await page.goto('/more');
  await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.demo-strip').count();}).toBe(0);
  await expect(page.locator('.account-actions').getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await expect(page.locator('.topbar').getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  if(info.project.name!=='public-desktop'){await page.setViewportSize({width:320,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
  f.failLogout(true);await page.locator('.account-actions').getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('.toast[role="alert"]')).toContainText('not confirmed');await expect(page).toHaveURL(/\/more$/);
  f.failLogout(false);const second=await context.newPage();await second.goto('/feed');await expect(second.locator('.wall-post')).toHaveCount(1);
  await expect.poll(async()=>{await second.evaluate(()=>window.dispatchEvent(new Event('focus')));return second.locator('.demo-strip').count();}).toBe(0);
  await page.locator('.account-actions').getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/auth\?force=1&signedOut=1$/);await expect(second).toHaveURL(/\/auth\?force=1&signedOut=1$/);
  await page.goto('/feed');await expect(page.locator('.wall-post')).toHaveCount(0);expect(await page.evaluate(async()=>(await fetch('/api/feed',{cache:'no-store'})).status)).toBe(401);await second.close();
});

test('organizer can hide and restore reported replies without changing private chat',async({page,context})=>{
  const f=await fixture(context);f.seed();
  const reply:FeedReply={id:'72000000-0000-4000-8000-000000000043',post_id:'71000000-0000-4000-8000-000000000042',author_id:'71000000-0000-4000-8000-000000000099',author_name:'Another attendee',body:'Reply for organizer review',status:'visible',version:0,created_at:'2026-10-06T18:00:00Z',updated_at:'2026-10-06T18:00:00Z'};
  let resolved=false;
  await context.route('**/api/admin/feed?*',r=>r.fulfill({json:{posts:[],reportedPosts:[],reports:[],hasMore:false}}));
  await context.route('**/api/admin/feed/replies*',async r=>{
    if(r.request().method()==='PATCH'){const data=r.request().postDataJSON();expect(data.replyId).toBe(reply.id);reply.status=data.status;resolved=true;return r.fulfill({json:{saved:true}});}
    return r.fulfill({json:{replies:[reply],reportedReplies:[],reports:resolved?[]:[{id:'74000000-0000-4000-8000-000000000042',reply_id:reply.id,reason:'Please review this reply',status:'open'}],hasMore:false}});
  });
  await page.goto('/admin/feed');await page.getByRole('button',{name:'Hide reply & resolve'}).click();
  await expect(page.getByText('Open reply report',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Restore reply',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Restore reply',exact:true}).click();await expect(page.getByRole('button',{name:'Hide reply',exact:true})).toBeVisible();expect(reply.status).toBe('visible');
});
