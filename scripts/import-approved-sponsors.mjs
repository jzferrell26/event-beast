import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {backendAdmin,EVENT_ID,PROJECT_REF,query} from './backend-cli.mjs';

const commit=process.argv.includes('--commit');
const admin=backendAdmin();
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const stableId=value=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const names={
 'Xactus 2026.png':'Xactus','Figure.png':'Figure','NFTY Door.png':'NFTYDoor','EasyImpoundr.png':'EasyImpound','cuantico.png':'Cuantico AI',
 'TotalExpert.png':'Total Expert','Take3Tech.webp':'Take3','MovotoxLower black.png':'Movoto by Lower','aae-ghost-D.png':'Auto Appointment Engine',
 'EA-Appraisal-Black.png':'EA Appraisal','A1_AMC.png':'A1 AMC','lendware black.png':'Lendware','Mack Financial.png':'Mack Financial Services',
 'LoanBot 2026.png':'LoanBot+','Uplist-transparent-790x410_.png':'Uplist','Rize.png':'Rize','model-match.png':'Model Match','Halo.png':'Halo','Shredit.png':'SHREDIT',
 'Cutco_Logo.png':'Cutco','Hova Digital.png':'Hova Digital','Credstart.png':'CredStart','Addy AI.png':'Addy AI','mloop.png':'mLOOP','dexos logo_1.png':'dexOS',
 'Angie and Rachel_braincode logo.webp':'Braincode Centers','Trust Engine 2026.png':'TrustEngine','prosperitas.png':'Prosperitas Financial','Simon Thomsen POWR.png':'POWR','FirstHomeIQ.png':'FirstHomeIQ',
 'Seroka.png':'Seroka','TLOP-300x240.png':'The Loan Officer Podcast','Box and Bestow.png':'Box & Bestow','ASB_2026-Branded_DenverHub_CMYK.png':'ASB Branding and Fulfillment',
};
const tierNames=['Platinum Partners','Gold Partners','Special Partners','Silver Partners','Media Partners','Swag Partners'];
const layout=JSON.parse(await readFile('test-results/official-sponsor-layout.json','utf8'));
assert.equal(layout.length,6);assert.deepEqual(layout.map(t=>t.logos.length),[5,4,11,11,4,2]);
const existing=checked(await admin.from('sponsors').select('*').eq('event_id',EVENT_ID),'Existing sponsors');
const oldTiers=checked(await admin.from('sponsor_tiers').select('*').eq('event_id',EVENT_ID),'Existing tiers');
const event=checked(await admin.from('events').select('id,slug').eq('id',EVENT_ID).single(),'Event identity');
assert.equal(event.slug,'momentum-builder-live-2026');
const tiers=tierNames.map((name,index)=>({id:oldTiers.find(t=>t.name.toLowerCase()===name.toLowerCase()||(index===0&&t.name.toLowerCase()==='platinum'))?.id??stableId(`${EVENT_ID}:tier:${name}`),event_id:EVENT_ID,name,sort_order:(index+1)*10}));
const rows=[];
const downloaded=new Map();
const cachedPlan=JSON.parse(await readFile('test-results/sponsor-import-plan.json','utf8').catch(()=>'null'));
await mkdir('test-results/sponsor-logos',{recursive:true});
for(const [tierIndex,tier] of layout.entries())for(const [index,source] of tier.logos.entries()){
 const sourceFile=decodeURIComponent(new URL(source.src).pathname.split('/').at(-1)).replaceAll('+',' ');
 const name=names[sourceFile];assert.ok(name,`Unmapped logo ${sourceFile}`);
 const matches=existing.filter(s=>s.name===name&&s.tier_id===tiers[tierIndex].id);
 assert.ok(matches.length<=1,'Ambiguous sponsor match');
 const id=matches[0]?.id??stableId(`${EVENT_ID}:official:${tierNames[tierIndex]}:${name}`);
 const url=new URL(source.src);assert.equal(url.hostname,'images.squarespace-cdn.com');
 let asset=downloaded.get(source.src);
 if(!asset){
  const cached=cachedPlan?.sponsors?.find(row=>row.source_url===source.src);
  let bytes=cached?await readFile(`test-results/sponsor-logos/${cached.asset_path.split('/').at(-1)}`).catch(()=>null):null;
  if(!bytes){
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok,`Logo download ${name}: HTTP ${response.status()}`);
   const original=Buffer.from(await response.arrayBuffer());
   bytes=await sharp(original,{limitInputPixels:80000000}).rotate().resize({width:1200,height:700,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toBuffer();
  }
  const hash=createHash('sha256').update(bytes).digest('hex');
  asset={bytes,path:`${EVENT_ID}/organizer/sponsor-logos/${hash.slice(0,24)}.webp`,hash};downloaded.set(source.src,asset);
  await writeFile(`test-results/sponsor-logos/${hash.slice(0,24)}.webp`,bytes);
 }
 rows.push({id,event_id:EVENT_ID,tier_id:tiers[tierIndex].id,name,logo_url:admin.storage.from('event-assets').getPublicUrl(asset.path).data.publicUrl,sort_order:(index+1)*10,published:true,is_demo:false,source_url:source.src,source_file:sourceFile,asset_path:asset.path});
}
const plan={source:'https://www.momentumbuilderevent.com/',capturedAt:new Date().toISOString(),project:PROJECT_REF,event:EVENT_ID,tiers,sponsors:rows};
await writeFile('test-results/sponsor-import-plan.json',JSON.stringify(plan,null,2));
console.log(JSON.stringify({commit,sponsorEntries:rows.length,uniqueLogoFiles:downloaded.size,tiers:tiers.map(t=>({name:t.name,sponsors:rows.filter(r=>r.tier_id===t.id).map(r=>r.name)}))},null,2));
if(!commit)process.exit(0);
// Avoid overwriting concurrently edited records; the owner approved this source
// sync, not replacement of unrelated sponsors or existing editorial copy.
await writeFile('supabase/.temp/sponsors-before-source-import.json',JSON.stringify({existing,oldTiers},null,2),{mode:0o600});
for(const asset of downloaded.values()){
 const result=await admin.storage.from('event-assets').upload(asset.path,asset.bytes,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
 if(result.error && !/already exists|duplicate/i.test(result.error.message))throw new Error(result.error.message);
 const read=checked(await admin.storage.from('event-assets').download(asset.path),'Verify stored logo');
 assert.equal(createHash('sha256').update(Buffer.from(await read.arrayBuffer())).digest('hex'),asset.hash);
}
const sqlString=value=>`'${String(value).replaceAll("'","''")}'`;
const sqlJson=value=>`${sqlString(JSON.stringify(value))}::jsonb`;
const expected=existing.map(s=>({id:s.id,version:s.content_version}));
query(`begin; set local lock_timeout='5s';
do $guard$ begin
 if not exists(select 1 from public.events where id='${EVENT_ID}' and slug='momentum-builder-live-2026') then raise exception 'Wrong event'; end if;
 if exists(select 1 from jsonb_to_recordset(${sqlJson(expected)}) as old(id uuid,version integer) join public.sponsors s on s.id=old.id where s.content_version<>old.version) then raise exception 'Sponsor changed after source review'; end if;
end $guard$;
insert into public.sponsor_tiers(id,event_id,name,sort_order) select id,event_id,name,sort_order from jsonb_to_recordset(${sqlJson(tiers)}) as t(id uuid,event_id uuid,name text,sort_order integer) on conflict(id) do update set name=excluded.name,sort_order=excluded.sort_order;
insert into public.sponsors(id,event_id,tier_id,name,logo_url,sort_order,published,is_demo)
select id,event_id,tier_id,name,logo_url,sort_order,published,is_demo from jsonb_to_recordset(${sqlJson(rows)}) as r(id uuid,event_id uuid,tier_id uuid,name text,logo_url text,sort_order integer,published boolean,is_demo boolean)
on conflict(id) do update set tier_id=excluded.tier_id,name=excluded.name,logo_url=excluded.logo_url,sort_order=excluded.sort_order,published=excluded.published,is_demo=excluded.is_demo;
insert into public.audit_log(event_id,action,entity_id,details) values('${EVENT_ID}','sponsors.official_source_sync','official-event-website',jsonb_build_object('source','https://www.momentumbuilderevent.com/','sponsor_tier_entries',37,'owner_authorized',true,'ordering','visually confirmed row-major within tier','removed_existing_records',false));
commit;`);
const readback=checked(await admin.from('sponsors').select('id,name,tier_id,logo_url,sort_order,published').eq('event_id',EVENT_ID).in('id',rows.map(r=>r.id)),'Read back sponsors');
assert.equal(readback.length,37);for(const row of rows)assert.ok(readback.some(s=>s.id===row.id&&s.tier_id===row.tier_id&&s.sort_order===row.sort_order&&s.logo_url===row.logo_url&&s.published));
await writeFile('docs/official-sponsor-import.json',JSON.stringify({...plan,verified:true,committedAt:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify({committed:true,verified:true,entries:readback.length,realSponsorRecordsDeleted:false}));
