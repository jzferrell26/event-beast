import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { backendAdmin, EVENT_ID, PROJECT_REF, query } from './backend-cli.mjs';

// This is an explicit source-backed, one-time patch, not a program reimport.
const commit=process.argv.includes('--commit');
const reportPath='docs/october-organizer-content-sync.json';
const prior=JSON.parse(await readFile(reportPath,'utf8').catch(()=>'null'));
if(prior?.committed){console.log(JSON.stringify({alreadyCommitted:true,note:'Preserve later organizer edits; review the recorded patch before any rerun.'}));process.exit(0);}
const db=backendAdmin();
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir('supabase/.temp',{recursive:true});
await mkdir('test-results/sonia-october',{recursive:true});
const read=query(`select jsonb_build_object('event',(select to_jsonb(e) from public.events e where e.id='${EVENT_ID}'),'settings',(select to_jsonb(s) from public.event_settings s where s.event_id='${EVENT_ID}'),'sponsors',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('tier_name',t.name)) from public.sponsors s left join public.sponsor_tiers t on t.event_id=s.event_id and t.id=s.tier_id where s.event_id='${EVENT_ID}'),'ads',(select jsonb_agg(to_jsonb(a)) from public.agenda_sponsor_placements a where a.event_id='${EVENT_ID}'),'program_hash',(select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.agenda_sessions s where s.event_id='${EVENT_ID}')) as snapshot;`)[0].snapshot;
assert.equal(read.event.slug,'momentum-builder-live-2026');
assert.ok(Object.hasOwn(read.settings,'wifi_network'),'Apply the reviewed additive migration before this content patch.');
await writeFile('supabase/.temp/pre-october-organizer-polish.json',JSON.stringify(read,null,2),{mode:0o600});
const settings={sponsor_page_title:'Impact Partners',wifi_network:'Hyatt-Meeting',wifi_password:'MBlive2026',support_sms:'747-213-2155',venue_floor_plan_url:'https://assets.hyatt.com/content/dam/hyatt/hyattdam/documents/2020/01/02/1234/Hyatt-Regency-Dallas-Floor-Plan-English.pdf'};
for(const field of Object.keys(settings))assert.ok(!read.settings[field]||read.settings[field]===settings[field],`Organizer already changed ${field}; reconcile rather than overwrite.`);
const captions={'Xactus':'Kickoff Party','EA Appraisal':'Kickoff Party','A1 AMC':'Registration & Charging Stations','Lendware':'VIP Lunch','Mack Financial Services':'VIP Lunch','LoanBot+':'Closing Party','Uplist':'Breakfast','Rize':'Breakfast','Model Match':'Books','Halo':'Inner Circle Dinner','SHREDIT':'Closing Party'};
const partners=Object.entries(captions).map(([name,note])=>{
 const matches=read.sponsors.filter(s=>s.name===name&&s.tier_name==='Special Partners');assert.equal(matches.length,1,'Resolve exact Special Partners row for '+name);
 const row=matches[0];assert.ok(!row.sponsorship_note||row.sponsorship_note===note,'Caption already edited: '+name);return {...row,note};
});
const sourcePath='test-results/sonia-october/nftydoor-source.png';
const source=await readFile(sourcePath);
assert.equal(source.subarray(0,8).toString('hex'),'89504e470d0a1a0a','NFTYDoor source is not the approved PNG bytes.');
const metadata=await sharp(source).metadata();assert.equal(metadata.width,700);assert.equal(metadata.height,1500);
const bytes=await sharp(source).webp({lossless:true}).toBuffer();
const path=`${EVENT_ID}/organizer/sponsor-ads/nftydoor-approved-still-${digest(source).slice(0,16)}.webp`;
const publicUrl=db.storage.from('event-assets').getPublicUrl(path).data.publicUrl;
const nfty=read.ads.filter(ad=>read.sponsors.find(s=>s.id===ad.sponsor_id)?.name==='NFTYDoor');assert.equal(nfty.length,1);
assert.ok(nfty[0].image_url.endsWith('/nftydoor-85cae98d91c2fe61.webp')||nfty[0].image_url===publicUrl,'NFTYDoor creative changed; review new organizer edit first.');
const adChanges=read.ads.map(ad=>{
 const sponsor=read.sponsors.find(s=>s.id===ad.sponsor_id);assert.ok(sponsor);
 const link=ad.link_url||sponsor.cta_url;const url=new URL(link);assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password);
 return {...ad,sponsor_name:sponsor.name,expected:ad,next_link:link,next_image:ad.id===nfty[0].id?publicUrl:ad.image_url,next_alt:ad.id===nfty[0].id?'NFTYDoor: The MLO’s favorite HELOC platform. Give your clients a better HELOC experience. Close more loans, close them faster, and look great doing it.':ad.image_alt};
}).filter(ad=>ad.next_link!==ad.link_url||ad.next_image!==ad.image_url);
const report={source:'Sonia October 1 08:13:02 UTC review email and its supplied Special Partners screenshot',project:PROJECT_REF,event:EVENT_ID,settingsChanged:Object.keys(settings),captions:partners.map(s=>({id:s.id,name:s.name,note:s.note})),adChanges:adChanges.map(a=>({id:a.id,name:a.sponsor_name,url:a.next_link,imageChanged:a.next_image!==a.image_url})),nftySource:{sha256:digest(source),width:metadata.width,height:metadata.height,storedSha256:digest(bytes),storagePath:path},repeatedPlacementsCreated:0,repeatContracts:'Sponsor names and counts still need organizer confirmation; Copy placement is available in the editor.',agendaRowsChanged:0,committed:false};
console.log(JSON.stringify(report,null,2));
if(!commit)process.exit(0);
const stored=await db.storage.from('event-assets').upload(path,bytes,{contentType:'image/webp',cacheControl:'3600',upsert:false});
if(stored.error&&!/already exists|duplicate/i.test(stored.error.message))throw stored.error;
const verify=await db.storage.from('event-assets').download(path);assert.ifError(verify.error);assert.equal(digest(Buffer.from(await verify.data.arrayBuffer())),digest(bytes));
query(`begin; set local lock_timeout='5s'; set local statement_timeout='20s';
 do $guard$ begin
 perform 1 from public.event_settings where event_id='${EVENT_ID}' for update;
 if (select to_jsonb(s) from public.event_settings s where event_id='${EVENT_ID}') is distinct from ${literal(JSON.stringify(read.settings))}::jsonb then raise exception 'Event settings changed during review'; end if;
 ${partners.map(s=>`perform 1 from public.sponsors where event_id='${EVENT_ID}' and id=${literal(s.id)} and content_version=${s.content_version} and sponsorship_note=${literal(s.sponsorship_note??'')} for update; if not found then raise exception 'Sponsor changed during review'; end if;`).join('\n')}
 ${adChanges.map(ad=>`perform 1 from public.agenda_sponsor_placements where event_id='${EVENT_ID}' and id=${literal(ad.id)} for update; if (select to_jsonb(a) from public.agenda_sponsor_placements a where a.event_id='${EVENT_ID}' and a.id=${literal(ad.id)}) is distinct from ${literal(JSON.stringify(ad.expected))}::jsonb then raise exception 'Ad changed during review'; end if;`).join('\n')}
 end $guard$;
 update public.event_settings set ${Object.entries(settings).map(([key,value])=>key+'='+literal(value)).join(',')} where event_id='${EVENT_ID}';
 ${partners.map(s=>`update public.sponsors set sponsorship_note=${literal(s.note)} where event_id='${EVENT_ID}' and id=${literal(s.id)};`).join('\n')}
 ${adChanges.map(ad=>`update public.agenda_sponsor_placements set link_url=${literal(ad.next_link)},image_url=${literal(ad.next_image)},image_alt=${literal(ad.next_alt)} where event_id='${EVENT_ID}' and id=${literal(ad.id)};`).join('\n')}
 insert into public.audit_log(event_id,action,entity_id,details) values('${EVENT_ID}','organizer.october_polish','sonia-october-review',${literal(JSON.stringify({source:report.source,settingsFields:Object.keys(settings),captionCount:partners.length,adCount:adChanges.length,programImported:false}))}::jsonb);
 commit;`);
const after=query(`select (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.agenda_sessions s where s.event_id='${EVENT_ID}') as program_hash,(select count(*) from public.agenda_sponsor_placements where event_id='${EVENT_ID}' and published and link_url='') as unlinked_ads;`)[0];
assert.equal(Number(after.unlinked_ads),0);assert.equal(after.program_hash,read.program_hash,'An agenda edit occurred concurrently; this patch did not intentionally write agenda rows.');
await writeFile(reportPath,JSON.stringify({...report,committed:true,committedAt:new Date().toISOString(),programUnchanged:true,unlinkedPublishedAds:0},null,2)+'\n');
console.log(JSON.stringify({committed:true,programUnchanged:true,unlinkedAds:0}));
