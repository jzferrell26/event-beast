import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { EVENT_ID, query } from './backend-cli.mjs';
const source=JSON.parse(await readFile('test-results/official-sponsor-layout.json','utf8'));
const imported=JSON.parse(await readFile('docs/official-sponsor-import.json','utf8'));
const existing=query(`select id,name,cta_url,cta_label,content_version from public.sponsors where event_id='${EVENT_ID}';`);
const changes=[],preserved=[],unlinked=[];
for(const sponsor of imported.sponsors){
 const live=existing.find(item=>item.id===sponsor.id);assert.ok(live);
 if(live.cta_url){preserved.push(live.name);continue;}
 // The captured site points Mack Financial at Lendware. Do not propagate a
 // visibly mismatched company destination merely because it is in the source.
 if(live.name==='Mack Financial Services'){unlinked.push(live.name+' (source points to another company; organizer confirmation needed)');continue;}
 const targets=[...new Set(source.flatMap(tier=>tier.logos).filter(logo=>logo.src===sponsor.source_url).map(logo=>logo.link).filter(Boolean))];
 if(!targets.length){unlinked.push(live.name);continue;}
 assert.equal(targets.length,1,'Ambiguous official sponsor destination; review before publishing');
 const url=new URL(targets[0]);assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password);
 changes.push({...live,cta_url:url.href,cta_label:'Visit website'});
}
const report={source:'Official event-site sponsor image links captured September 30, 2026',newLinks:changes.map(({id,name,cta_url})=>({id,name,url:cta_url})),existingLinksPreserved:preserved,missingSourceLinks:unlinked,committed:false};
console.log(JSON.stringify(report,null,2));
if(!process.argv.includes('--commit'))process.exit(0);
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
query(`begin; do $guard$ begin ${changes.map(s=>`perform 1 from public.sponsors where event_id='${EVENT_ID}' and id=${literal(s.id)} and content_version=${s.content_version} and cta_url='' for update; if not found then raise exception 'Sponsor changed after link review'; end if;`).join('\n')} end $guard$;
 ${changes.map(s=>`update public.sponsors set cta_url=${literal(s.cta_url)},cta_label=${literal(s.cta_label)} where event_id='${EVENT_ID}' and id=${literal(s.id)};`).join('\n')}
 insert into public.audit_log(event_id,action,entity_id,details) values('${EVENT_ID}','sponsor_links.official_source','official-event-website',${literal(JSON.stringify({changed:changes.length,preserved:preserved.length,noGuessedDomains:true}))}::jsonb);commit;`);
await writeFile('docs/september-30-sponsor-links.json',JSON.stringify({...report,committed:true,committedAt:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify({committed:true,changed:changes.length,preserved:preserved.length}));
