import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { query, EVENT_ID, PROJECT_REF } from './backend-cli.mjs';
import { program, lunches } from '../data/september-30-program.mjs';

const commit = process.argv.includes('--commit');
const reportPath = 'docs/september-30-content-sync.json';
const existingReport = JSON.parse(await readFile(reportPath,'utf8').catch(()=>'null'));
if (existingReport?.committed) {
 console.log(JSON.stringify({alreadyCommitted:true,report:reportPath,note:'Repeat import is intentionally blocked to preserve later organizer edits.'})); process.exit(0);
}
const literal = value => "'"+String(value).replaceAll("'","''")+"'";
const json = value => literal(JSON.stringify(value))+'::jsonb';
const stableId = value => { const h=createHash('sha256').update(value).digest('hex'); return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32); };
const tables = ['agenda_days','agenda_sessions','session_speakers','agenda_sponsor_placements','lunch_locations','event_activities','agenda_import_notes'];
const captured = query(`select jsonb_build_object('event',(select to_jsonb(e) from public.events e where id='${EVENT_ID}'),${tables.map(table => `${literal(table)},(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('_hash',md5(to_jsonb(t)::text))),'[]'::jsonb) from public.${table} t where event_id='${EVENT_ID}')`).join(',')},'speakers',(select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name)) from public.speakers where event_id='${EVENT_ID}')) as snapshot;`)[0].snapshot;
assert.equal(captured.event.slug,'momentum-builder-live-2026');
assert.equal(captured.event.timezone,'America/Chicago');
await mkdir('supabase/.temp',{recursive:true});
await writeFile('supabase/.temp/pre-september-30-content.json',JSON.stringify(captured,null,2),{mode:0o600});
const newSessions=[],links=[],missingSpeakerNames=[];
const used=new Set();
for(const day of program){
 const oldDay=captured.agenda_days.find(d=>d.date===day.date);assert.ok(oldDay,`Missing event day ${day.date}`);
 for(const [index,item] of day.rows.entries()){
  const found=item.previousTitle?captured.agenda_sessions.filter(row=>row.day_id===oldDay.id&&row.title===item.previousTitle):[];
  assert.ok(found.length<=1,`Ambiguous existing title ${item.previousTitle}`);
  if(item.previousTitle)assert.equal(found.length,1,`Previous title changed; review before import: ${item.previousTitle}`);
  const id=found[0]?.id??stableId(`${EVENT_ID}:public-agenda:${day.date}:${item.time}:${item.title}`);
  assert.ok(!used.has(id),'Duplicate mapping');used.add(id);
  const start=new Date(`${day.date}T${item.time}:00-05:00`);
  const end=item.end?new Date(`${day.date}T${item.end}:00-05:00`):day.rows[index+1]?new Date(`${day.date}T${day.rows[index+1].time}:00-05:00`):new Date(start.getTime()+60000);
  assert.ok(end>start);
  const local = new Intl.DateTimeFormat('en-CA',{timeZone:captured.event.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  assert.equal(local,day.date);
  newSessions.push({id,event_id:EVENT_ID,day_id:oldDay.id,title:item.title,description:item.description,starts_at:start.toISOString(),ends_at:end.toISOString(),end_time_confirmed:Boolean(item.end),room:item.room,session_type:item.type,sponsor_id:found[0]?.sponsor_id??null,published:true,is_demo:false});
  for(const name of item.speakers){const match=captured.speakers.filter(s=>s.full_name===name);assert.equal(match.length,1,`Resolve speaker ${name}`);links.push({event_id:EVENT_ID,session_id:id,speaker_id:match[0].id});}
 }
}
missingSpeakerNames.push('Steven Petrov','Dan Catinella'); // Named in supplied descriptions; no invented bios or headshots.
const superseded=captured.agenda_sessions.filter(s=>s.published&&!used.has(s.id));
const adChanges=captured.agenda_sponsor_placements.filter(p=>p.after_session_id&&!used.has(p.after_session_id)).map(p=>{
 const prior=captured.agenda_sessions.find(s=>s.id===p.after_session_id);
 const alternatives=newSessions.filter(s=>s.day_id===p.day_id&&(!prior||Date.parse(s.starts_at)<=Date.parse(prior.starts_at))).sort((a,b)=>b.starts_at.localeCompare(a.starts_at));
 return {id:p.id,after_session_id:alternatives[0]?.id??null};
});
const newLunch=lunches.map((l,index)=>({id:stableId(`${EVENT_ID}:lunch:${l.date}:${l.title}`),event_id:EVENT_ID,event_date:l.date,category:l.category,title:l.title,location:l.location,hours:l.hours,description:l.description,dietary_info:l.dietary_info,menu_url:l.menu_url,directions_url:'',image_url:'',sort_order:(index+1)*10,published:true,is_demo:false}));
assert.equal(newLunch.length,16);assert.equal(newSessions.length,49);
const conflicts = query(`select action,entity_id,created_at from public.audit_log where event_id='${EVENT_ID}' and actor_user_id is not null and created_at>'2026-09-30T06:02:05Z' and (action like 'agenda_sessions.%' or action like 'session_speakers.%' or action like 'lunch_locations.%') and entity_id in (select id::text from public.agenda_sessions where event_id='${EVENT_ID}' union select id::text from public.lunch_locations where event_id='${EVENT_ID}');`);
assert.equal(conflicts.length,0,'An organizer edited live content after the source email. Reconcile before overwriting.');
const report={source:'Sonia Le · September 30 agenda + corrected Oct 7 lunch + Oct 8 lunch',sourceReceivedUtc:['2026-09-30T06:02:05Z','2026-09-30T06:24:40Z','2026-09-30T06:26:03Z'],project:PROJECT_REF,event:EVENT_ID,programRows:newSessions.length,lunchRows:newLunch.length,preservedSessionIds:newSessions.filter(s=>captured.agenda_sessions.some(old=>old.id===s.id)).length,supersededPublishedSessions:superseded.map(s=>({id:s.id,title:s.title})),remappedAdAnchors:adChanges,unconfirmedEndTimesHidden:newSessions.filter(s=>!s.end_time_confirmed).length,speakerNamesWithoutInventedProfiles:missingSpeakerNames,funStuff:'No content invented; the organizer is preparing this page.',committed:false};
await writeFile('supabase/.temp/september-30-import-plan.json',JSON.stringify({report,newSessions,newLunch,links},null,2));
console.log(JSON.stringify(report,null,2));
if(!commit)process.exit(0);
const guards=tables.map(table=>{
 const rows=captured[table];
 return `perform 1 from public.${table} where event_id='${EVENT_ID}' for update;
 if (select count(*) from public.${table} where event_id='${EVENT_ID}')<>${rows.length} or exists(select 1 from jsonb_array_elements(${json(rows)}) old left join public.${table} live on ${table==='session_speakers'?'live.session_id=(old->>\'session_id\')::uuid and live.speaker_id=(old->>\'speaker_id\')::uuid':table==='agenda_import_notes'?'live.session_id=(old->>\'session_id\')::uuid':'live.id=(old->>\'id\')::uuid'} and live.event_id='${EVENT_ID}' where md5(to_jsonb(live)::text) is distinct from old->>'_hash') then raise exception 'Concurrent ${table} change; aborting source import'; end if;`;
}).join('\n');
const upsert=(table,rows,columns,types)=>`insert into public.${table}(${columns.join(',')}) select ${columns.join(',')} from jsonb_to_recordset(${json(rows)}) as r(${columns.map((c,i)=>c+' '+types[i]).join(',')}) on conflict(id) do update set ${columns.filter(c=>!['id','event_id'].includes(c)).map(c=>c+'=excluded.'+c).join(',')};`;
const columns=['id','event_id','day_id','title','description','starts_at','ends_at','end_time_confirmed','room','session_type','sponsor_id','published','is_demo'];
const types=['uuid','uuid','uuid','text','text','timestamptz','timestamptz','boolean','text','text','uuid','boolean','boolean'];
const lunchColumns=['id','event_id','event_date','category','title','location','hours','description','dietary_info','menu_url','directions_url','image_url','sort_order','published','is_demo'];
query(`begin; set local lock_timeout='5s'; set local statement_timeout='30s';
 do $guard$ begin ${guards} end $guard$;
 ${program.map(d=>`update public.agenda_days set label=${literal(d.label)},published=true where event_id='${EVENT_ID}' and date=${literal(d.date)};`).join('\n')}
 ${upsert('agenda_sessions',newSessions,columns,types)}
 update public.agenda_sessions set published=false where event_id='${EVENT_ID}' and id in(select value::uuid from jsonb_array_elements_text(${json(superseded.map(s=>s.id))}));
 delete from public.session_speakers where event_id='${EVENT_ID}' and session_id in(select value::uuid from jsonb_array_elements_text(${json([...used])}));
 insert into public.session_speakers(event_id,session_id,speaker_id) select event_id,session_id,speaker_id from jsonb_to_recordset(${json(links)}) as x(event_id uuid,session_id uuid,speaker_id uuid);
 ${adChanges.map(ad=>`update public.agenda_sponsor_placements set after_session_id=${ad.after_session_id?literal(ad.after_session_id)+'::uuid':'null'} where event_id='${EVENT_ID}' and id=${literal(ad.id)};`).join('\n')}
 ${upsert('lunch_locations',newLunch,lunchColumns,['uuid','uuid','date','text','text','text','text','text','text','text','text','text','integer','boolean','boolean'])}
 insert into public.audit_log(event_id,action,entity_id,details) values('${EVENT_ID}','program.organizer_source_sync','sonia-september-30',${json({...report,committed:true})});
 commit;`);
const verify=query(`select (select count(*) from public.agenda_sessions where event_id='${EVENT_ID}' and published) as sessions,(select count(*) from public.lunch_locations where event_id='${EVENT_ID}' and published) as lunches,(select count(*) from public.agenda_sponsor_placements where event_id='${EVENT_ID}' and published) as ads,(select count(*) from public.event_activities where event_id='${EVENT_ID}') as fun_stuff;`)[0];
assert.equal(Number(verify.sessions),49);assert.equal(Number(verify.lunches),16);assert.equal(Number(verify.ads),6);
await writeFile(reportPath,JSON.stringify({...report,committed:true,committedAt:new Date().toISOString(),verify,sessionIds:newSessions.map(s=>({id:s.id,title:s.title,starts_at:s.starts_at}))},null,2)+'\n');
console.log(JSON.stringify({committed:true,verified:verify}));
