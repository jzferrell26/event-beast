import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { PGlite } from '@electric-sql/pglite';
import { descriptionParts, plainDescription, toggleDescriptionBold } from '../src/lib/description-format';
import { DescriptionText } from '../src/components/description-text';
import { searchAgenda } from '../src/lib/agenda-search';
import { demoGuide } from '../src/lib/demo';
import { adminDefaults, adminResources, resourceSchema } from '../src/lib/admin-resources';
import { asUser, createDatabase, ids, seedSecurityFixture } from './db-harness';

describe('small safe description formatting', () => {
  it('renders bold words and line breaks without interpreting HTML', () => {
    const text = 'Bring **your ideas**.\n<img src=x onerror=alert(1)> **Not HTML**';
    const html = renderToStaticMarkup(createElement(DescriptionText,{text}));
    expect(html).toContain('<strong>your ideas</strong>');
    expect(html).toContain('&lt;img'); expect(html).not.toContain('<img');
    expect(plainDescription(text)).toContain('Bring your ideas.\n');
  });
  it('leaves unmatched delimiters literal and does not process links or other markup', () => {
    expect(descriptionParts('Unfinished **word')).toEqual([{text:'Unfinished **word',bold:false}]);
    expect(plainDescription('[link](javascript:bad)')).toBe('[link](javascript:bad)');
    expect(descriptionParts('**one** and **two**').filter(part=>part.bold).map(part=>part.text)).toEqual(['one','two']);
  });
  it('wraps and unwraps selected words without rewriting the rest of the description', () => {
    const bold=toggleDescriptionBold('Say hello today',4,9);
    expect(bold).toEqual({value:'Say **hello** today',start:6,end:11});
    expect(toggleDescriptionBold(bold.value,bold.start,bold.end)).toEqual({value:'Say hello today',start:4,end:9});
    expect(toggleDescriptionBold('Hello ',6,6).value).toBe('Hello **bold text**');
  });
});

describe('event-wide agenda lookup', () => {
  const guide=structuredClone(demoGuide);
  const base=guide.sessions[0];
  guide.days=[0,1,2].map(i=>({...guide.days[0],id:'day-'+i,date:'2026-10-0'+(6+i),label:'Day '+(i+1)}));
  guide.sessions=[0,1,2].map(i=>({...base,id:'session-'+i,day_id:guide.days[i].id,title:'Shared topic '+i,description:'Bring **new ideas**',starts_at:`2026-10-0${6+i}T15:00:00Z`}));
  const options={dayId:'day-0',query:'',savedOnly:false,onlySaved:false,saved:[] as string[]};
  it('keeps the selected day when there is no query and searches all three when entered',()=>{
    expect(searchAgenda(guide,options)).toHaveLength(1);
    expect(searchAgenda(guide,{...options,query:' SHARED TOPIC '})).toHaveLength(3);
    expect(searchAgenda(guide,{...options,query:'new ideas'})).toHaveLength(3);
  });
  it('preserves saved-only selection independently of search or date',()=>{
    expect(searchAgenda(guide,{...options,query:'topic',onlySaved:true,saved:['session-2']}).map(row=>row.id)).toEqual(['session-2']);
    expect(searchAgenda(guide,{...options,savedOnly:true,onlySaved:true,saved:['session-1','session-2']})).toHaveLength(2);
  });
  it('matches a linked speaker on another day and does not mutate guide order',()=>{
    const copy=structuredClone(guide);copy.speakers=[{...copy.speakers[0],id:'speaker',full_name:'Other Day Speaker'}];copy.sessionSpeakers=[{event_id:copy.event.id,session_id:'session-2',speaker_id:'speaker'}];
    expect(searchAgenda(copy,{...options,query:'other day speaker'}).map(row=>row.id)).toEqual(['session-2']);
    expect(guide.sessions.map(row=>row.id)).toEqual(['session-0','session-1','session-2']);
  });
});

describe('original compact logo',()=>{
  it('retains the supplied source and emits real opaque square PNGs',async()=>{
    const bytes=readFileSync('public/branding/momentum-builder-mark.png');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('a18d3fd4ecb2c95bfcb6cacb758795de8fab9def85147a7bcc40ab9c657fe4aa');
    for(const size of [32,180,192,512]){
      const image=await sharp(`public/icons/momentum-mark-${size}.png`).metadata();
      expect([image.format,image.width,image.height,image.hasAlpha]).toEqual(['png',size,size,false]);
    }
  });
  it('uses the new cache-distinct paths in browser and install metadata',()=>{
    const layout=readFileSync('src/app/layout.tsx','utf8');
    const manifest=readFileSync('src/app/manifest.ts','utf8');
    expect(layout).toContain('/icons/momentum-mark-32.png');expect(layout).toContain('/icons/momentum-mark-180.png');
    expect(manifest).toContain('/icons/momentum-mark-maskable-512.png');
  });
});

describe('organizer-owned public details',()=>{
  let db:PGlite;
  beforeAll(async()=>{db=await createDatabase({hostedFunctionGrants:true});await seedSecurityFixture(db);});
  afterAll(async()=>{await db?.close();});
  it('keeps legacy payloads valid without filling new fields that could overwrite later edits',()=>{
    const resource=adminResources.event_settings;
    const values=adminDefaults(resource);for(const field of resource.fields.filter(item=>item.optional))delete values[field.key];
    values.welcome_title='Event';
    const parsed=resourceSchema(resource).parse(values);
    expect(parsed).not.toHaveProperty('wifi_network');expect(parsed).not.toHaveProperty('sponsor_page_title');
  });
  it('lets an event Admin edit public Wi-Fi, floor plan and partner copy',async()=>{
    await asUser(db,ids.admin,()=>db.query("update public.event_settings set sponsor_page_title='Impact Partners',wifi_network='Test-Network',wifi_password='Test-Password',venue_floor_plan_url='https://example.test/map.pdf' where event_id=$1",[ids.event]));
    expect((await asUser(db,null,()=>db.query('select sponsor_page_title,wifi_network from public.event_settings where event_id=$1',[ids.event]))).rows).toEqual([{sponsor_page_title:'Impact Partners',wifi_network:'Test-Network'}]);
    expect((await asUser(db,ids.alice,()=>db.query("update public.event_settings set wifi_network='Unauthorized' where event_id=$1 returning event_id",[ids.event]))).rows).toEqual([]);
  });
  it('keeps sponsor captions Admin controlled and independent of private contact information',async()=>{
    await asUser(db,ids.admin,()=>db.query("update public.sponsors set sponsorship_note='Kickoff Party' where id=$1",[ids.sponsor]));
    expect((await asUser(db,ids.bob,()=>db.query("update public.sponsors set sponsorship_note='Wrong' where id=$1 returning id",[ids.sponsor]))).rows).toEqual([]);
    expect((await asUser(db,null,()=>db.query('select sponsorship_note from public.sponsors where id=$1',[ids.sponsor]))).rows).toEqual([{sponsorship_note:'Kickoff Party'}]);
    expect((await asUser(db,ids.admin,()=>db.query("update public.event_settings set sponsor_page_title='Wrong event' where event_id=$1 returning event_id",[ids.otherEvent]))).rows).toEqual([]);
  });
});
