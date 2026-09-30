import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backendAdmin,EVENT_ID,PROJECT_REF,query} from './backend-cli.mjs';

const commit=process.argv.includes('--commit');
const admin=backendAdmin();
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const stableId=value=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const manifest=JSON.parse(await readFile('test-results/sonia-ad-prepared/manifest.json','utf8'));
assert.equal(manifest.length,6);
const sponsors=checked(await admin.from('sponsors').select('id,name,tier_id').eq('event_id',EVENT_ID).eq('published',true),'Published sponsors');
const tiers=checked(await admin.from('sponsor_tiers').select('id,sort_order').eq('event_id',EVENT_ID),'Sponsor tiers');
const days=checked(await admin.from('agenda_days').select('id').eq('event_id',EVENT_ID).eq('published',true),'Published days');
const sessions=checked(await admin.from('agenda_sessions').select('id,day_id,title,starts_at').eq('event_id',EVENT_ID).eq('published',true).order('starts_at'),'Published program').filter(s=>days.some(d=>d.id===s.day_id));
assert.ok(sessions.length>=12,'Do not guess placements before the program exists');
const definitions=[
 {slug:'xactus',name:'Xactus',alt:'Xactus: Precision at scale. Less friction. More certainty. Learn more at xactus.com.',link:'https://xactus.com'},
 {slug:'figure',name:'Figure',alt:'Figure Digital HELOC: Strengthen your relationships, protect your portfolio, close more loans faster.',link:'https://figure.com'},
 {slug:'nftydoor',name:'NFTYDoor',alt:"NFTYDoor: The MLO's favorite HELOC platform. Get started.",link:''},
 {slug:'total-expert',name:'Total Expert',alt:'Total Expert: Make every shot count. Visit the Total Expert booth and learn about AI solutions.',link:'https://totalexpert.com/AI-Solutions'},
 {slug:'auto-appointment-engine',name:'Auto Appointment Engine',alt:'Auto Appointment Engine: We build revenue. Not marketing. Do not get ghosted by your past clients.',link:''},
 {slug:'braincode',name:'Braincode Centers',alt:'Braincode Centers onsite brain mapping at Momentum Builder, October 6 through 8. Scan the QR code in the ad to reserve a time.',link:''},
];
const rows=[];
for(const [index,definition] of definitions.entries()){
 const asset=manifest.find(item=>item.slug===definition.slug);assert.ok(asset);
 const bytes=await readFile(asset.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
 const sponsor=sponsors.filter(s=>s.name===definition.name).sort((a,b)=>(tiers.find(t=>t.id===a.tier_id)?.sort_order??999)-(tiers.find(t=>t.id===b.tier_id)?.sort_order??999))[0];assert.ok(sponsor);
 const anchor=sessions[Math.min(sessions.length-1,Math.floor((index+1)*sessions.length/(definitions.length+1)))];
 const path=`${EVENT_ID}/organizer/sponsor-ads/${definition.slug}-${asset.sha256.slice(0,16)}.webp`;
 rows.push({id:stableId(`${EVENT_ID}:sonia-supplied-ad:${definition.slug}`),event_id:EVENT_ID,day_id:anchor.day_id,after_session_id:anchor.id,sponsor_id:sponsor.id,headline:`${definition.name} sponsor message`,body:'',image_url:admin.storage.from('event-assets').getPublicUrl(path).data.publicUrl,image_alt:definition.alt,image_format:asset.format,link_url:definition.link,surface:'agenda',sort_order:(index+1)*10,published:true,source:asset.source,preparation:asset.preparation,asset_path:path,sha256:asset.sha256,bytes:asset.bytes,after_session_title:anchor.title});
}
const plan={project:PROJECT_REF,event:EVENT_ID,source:'Sonia Le supplied Attendee website ads folder',placementPolicy:'Six initial editable agenda placements spaced through the published program. Not a claim of contractual placement approval.',rows};
await writeFile('test-results/ad-import-plan.json',JSON.stringify(plan,null,2));
console.log(JSON.stringify({commit,placements:rows.map(row=>({headline:row.headline,after:row.after_session_title,source:row.source,shape:row.image_format}))},null,2));
if(!commit)process.exit(0);
for(const row of rows){
 const asset=manifest.find(item=>item.source===row.source);const bytes=await readFile(asset.file);
 const result=await admin.storage.from('event-assets').upload(row.asset_path,bytes,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
 if(result.error&&!/already exists|duplicate/i.test(result.error.message))throw new Error(result.error.message);
 const read=checked(await admin.storage.from('event-assets').download(row.asset_path),'Verify stored creative');
 assert.equal(createHash('sha256').update(Buffer.from(await read.arrayBuffer())).digest('hex'),row.sha256);
}
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
query(`begin;
insert into public.agenda_sponsor_placements(id,event_id,day_id,after_session_id,sponsor_id,headline,body,image_url,image_alt,image_format,link_url,surface,sort_order,published)
select id,event_id,day_id,after_session_id,sponsor_id,headline,body,image_url,image_alt,image_format,link_url,surface,sort_order,published from jsonb_to_recordset(${literal(JSON.stringify(rows))}::jsonb) as r(id uuid,event_id uuid,day_id uuid,after_session_id uuid,sponsor_id uuid,headline text,body text,image_url text,image_alt text,image_format text,link_url text,surface text,sort_order integer,published boolean) on conflict(id) do nothing;
insert into public.audit_log(event_id,action,entity_id,details) values('${EVENT_ID}','sponsor_ads.supplied_creative_import','sonia-approved-source',jsonb_build_object('source_files',6,'default_positions_require_organizer_review',true,'gif_static_frame',26,'pdf_full_page',true,'copied_ad_text_unchanged',true));
commit;`);
const stored=checked(await admin.from('agenda_sponsor_placements').select('id,image_url,day_id,after_session_id,published').eq('event_id',EVENT_ID).in('id',rows.map(r=>r.id)),'Verify creative records');
assert.equal(stored.length,6);
for(const row of rows)assert.ok(stored.some(s=>s.id===row.id&&s.image_url===row.image_url&&s.published),'Previously imported ad was edited; do not overwrite the organizer decision');
await writeFile('docs/supplied-creative-import.json',JSON.stringify({...plan,committedAt:new Date().toISOString(),verified:true},null,2)+'\n');
console.log(JSON.stringify({committed:true,verified:true,ads:6,originalCopyAltered:false}));
