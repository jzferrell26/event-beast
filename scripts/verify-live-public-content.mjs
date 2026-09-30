import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
import {EVENT_ID} from './backend-cli.mjs';

const site='https://event-beast.vercel.app';
const sponsorSource=JSON.parse(await readFile('docs/official-sponsor-import.json','utf8'));
const adSource=JSON.parse(await readFile('docs/supplied-creative-import.json','utf8'));
const checks=[];
const run=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log(JSON.stringify(checks.at(-1)));};
await mkdir('test-results/live-public',{recursive:true});
const guide=await(await fetch(`${site}/api/guide`,{cache:'no-store'})).json();
await run('Live guide has all approved sponsor listings and six real supplied creatives',async()=>{
 assert.equal(guide.event.id,EVENT_ID);assert.equal(guide.mode,'live');assert.equal(guide.publicSite,true);
 assert.equal(guide.sponsors.length,37);assert.equal(guide.placements.length,6);
 assert.equal(guide.settings.directory_enabled,false);assert.equal(guide.settings.messaging_enabled,false);
 assert.ok(guide.sponsors.every(s=>!s.booth&&!s.description));
 for(const tier of sponsorSource.tiers){
  const expected=sponsorSource.sponsors.filter(s=>s.tier_id===tier.id).sort((a,b)=>a.sort_order-b.sort_order);
  const actual=guide.sponsors.filter(s=>s.tier_id===tier.id).sort((a,b)=>a.sort_order-b.sort_order);
  assert.deepEqual(actual.map(s=>s.name),expected.map(s=>s.name));
 }
 for(const ad of adSource.rows)assert.ok(guide.placements.some(p=>p.id===ad.id&&p.image_url===ad.image_url&&p.after_session_id===ad.after_session_id));
});
await run('Every published sponsor logo and supplied creative is reachable',async()=>{
 const urls=[...new Set([...guide.sponsors.map(s=>s.logo_url),...guide.placements.map(p=>p.image_url)])];
 for(let i=0;i<urls.length;i+=6)await Promise.all(urls.slice(i,i+6).map(async url=>{const response=await fetch(url);assert.equal(response.status,200);assert.ok(response.headers.get('content-type')?.startsWith('image/'));await response.arrayBuffer();}));
});
for(const [name,engine,viewport] of [['desktop',chromium,{width:1440,height:1000}],['phone',chromium,{width:390,height:844}],['safari-engine',webkit,{width:390,height:844}]]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport,serviceWorkers:'block'});const page=await context.newPage();
  await run(`${name}: public navigation and real sponsor logos render without overflow`,async()=>{
   await page.goto(`${site}/sponsors`);await page.locator('.public-sponsor-logo-card').first().waitFor();
   await expect(page.locator('.public-sponsor-logo-card')).toHaveCount(37);
   await page.evaluate(async()=>{for(let top=0;top<document.documentElement.scrollHeight;top+=700){scrollTo(0,top);await new Promise(r=>setTimeout(r,70));}scrollTo(0,0);});
   await page.waitForFunction(()=>[...document.querySelectorAll('.public-sponsor-logo img')].every(img=>img.complete&&img.naturalWidth>0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.equal(await page.locator('a[href="/people"],a[href="/inbox"]').count(),0);
   await page.screenshot({path:`test-results/live-public/sponsors-${name}.png`,fullPage:true});
  });
  await run(`${name}: all six advertisements appear on their actual agenda days`,async()=>{
   await page.goto(`${site}/agenda`);const tabs=page.getByRole('tab');await tabs.first().waitFor();let rendered=0;
   for(let day=0;day<guide.days.length;day++){
    await tabs.nth(day).click();
    const expected=guide.placements.filter(p=>p.day_id===guide.days[day].id).length;
    await page.waitForFunction(n=>document.querySelectorAll('.sponsor-creative').length===n,expected);
    rendered+=await page.locator('.sponsor-creative').count();
    for(const ad of await page.locator('.sponsor-creative').all()){
     await ad.scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.sponsor-creative img')].filter(i=>i.getBoundingClientRect().top<innerHeight).every(i=>i.complete&&i.naturalWidth>0));
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   assert.equal(rendered,6);await page.screenshot({path:`test-results/live-public/agenda-${name}.png`,fullPage:true});
  });
  await context.close();
 }finally{await browser.close();}
}
await writeFile('docs/live-public-content-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),site,passed:true,checks,sponsorListings:37,uniqueSponsorNames:new Set(guide.sponsors.map(s=>s.name)).size,ads:6,actualPhysicalDevicesTested:false},null,2)+'\n');
