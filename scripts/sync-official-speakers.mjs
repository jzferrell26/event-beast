import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { backendAdmin, query, EVENT_ID, PROJECT_REF } from './backend-cli.mjs';

// Dry-run by default. Use --apply only after reviewing the named public cards.
// Scope: speakers and their content-addressed public photos in Event Beast only.
const apply = process.argv.includes('--apply');
const official = JSON.parse(readFileSync('data/official-speakers.json', 'utf8'));
if (official.source_url !== 'https://www.momentumbuilderevent.com/') throw new Error('Unexpected source');
const supplemental = JSON.parse(readFileSync('data/supplemental-speakers.json', 'utf8'));
const allSources = [...official.speakers, ...supplemental.speakers];
const allowedSources = new Set([official.source_url, 'https://cuantico.us/about', 'https://ericpost-thoughts.huzihalo.com/about/']);
if (allSources.some(s => !allowedSources.has(s.source_url))) throw new Error('Unreviewed speaker source');
const db = backendAdmin();
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`); return result.data; };
const key = name => name.normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
const existing = checked(await db.from('speakers').select('*').eq('event_id', EVENT_ID), 'Read event speakers');
const links = checked(await db.from('session_speakers').select('event_id,session_id,speaker_id').eq('event_id', EVENT_ID), 'Read session links');
const byName = new Map(existing.map(speaker => [key(speaker.full_name), speaker]));
if (byName.size !== existing.length) throw new Error('Duplicate existing speaker names require manual reconciliation');
const namespace = Buffer.from('b4fdc249058c4c0f9ba2c36f31f9da73', 'hex');
function id(name) { const hash = createHash('sha1').update(namespace).update(`speaker:${name}`).digest(); hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128; const hex = hash.subarray(0, 16).toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
const q = value => typeof value === 'boolean' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const plan = allSources.map(speaker => {
  const old = byName.get(key(speaker.name));
  if (old && !['', speaker.previous_import_bio, speaker.bio, ...(speaker.previous_import_bios ?? [])].includes(old.bio)) throw new Error(`Preserve organizer-edited biography for ${speaker.name}; review before syncing.`);
  if (old && old.source_url && old.source_url !== speaker.source_url) throw new Error(`Different organizer source for ${speaker.name}; review before syncing.`);
  if (!official.speakers.includes(speaker) && !old) throw new Error('Supplemental bios can only fill existing agenda speakers');
  if (!/^\/speakers\/[a-z0-9-]+\.webp$/.test(speaker.headshot_path) || !/^[a-f0-9]{64}$/.test(speaker.image_sha256)) throw new Error('Invalid imported asset path');
  const basename = speaker.headshot_path.split('/').at(-1).replace('.webp', `-${speaker.image_sha256.slice(0, 12)}.webp`);
  const object = `${EVENT_ID}/speakers/${basename}`;
  return { speaker, old, id: old?.id || id(speaker.name), object,
    url: `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/event-assets/${object}` };
});
if (new Set(plan.map(p => key(p.speaker.name))).size !== plan.length) throw new Error('Duplicate source records');
const missing = existing.filter(s => !allSources.some(record => key(record.name) === key(s.full_name))).map(s => s.full_name);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', project: PROJECT_REF, event: EVENT_ID,
  sourceSpeakers: plan.length, updates: plan.filter(p => p.old).length, additions: plan.filter(p => !p.old).map(p => p.speaker.name),
  missingSource: missing, supplementalSources: supplemental.speakers.map(s => ({ name: s.name, source: s.source_url })), existingLinksPreserved: links.length }));
if (apply) {
  mkdirSync('supabase/.temp', { recursive: true });
  writeFileSync('supabase/.temp/speakers-before-sync.json', JSON.stringify({ existing, links, timestamp: new Date().toISOString() }, null, 2));
  for (const row of plan) {
    const bytes = readFileSync(`public${row.speaker.headshot_path}`);
    if (createHash('sha256').update(bytes).digest('hex') !== row.speaker.image_sha256) throw new Error(`Portrait checksum mismatch: ${row.speaker.name}`);
    const upload = await db.storage.from('event-assets').upload(row.object, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error(`Portrait upload failed: ${row.speaker.name}`);
    const stored = checked(await db.storage.from('event-assets').download(row.object), 'Verify stored portrait');
    if (createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex') !== row.speaker.image_sha256) throw new Error('Stored portrait checksum mismatch');
  }
  const statements = plan.map(({ speaker, old, id: speakerId, url }) => old
    ? `update public.speakers set bio=${q(speaker.bio)},headshot_url=${q(url)},source_url=${q(speaker.source_url)} where id=${q(speakerId)} and event_id=${q(EVENT_ID)} and bio=${q(old.bio)} and headshot_url=${q(old.headshot_url)} and published=${q(old.published)} and source_url=${q(old.source_url)}; if not found then raise exception 'Speaker changed while the import was being prepared'; end if;`
    : `insert into public.speakers(id,event_id,full_name,title,bio,headshot_url,source_url,published,is_demo) values(${q(speakerId)},${q(EVENT_ID)},${q(speaker.name)},'',${q(speaker.bio)},${q(url)},${q(speaker.source_url)},true,false);`);
  if (statements.some(statement => statement.includes('$speaker_sync$'))) throw new Error('Unexpected SQL block delimiter in source text');
  query(`begin; do $speaker_sync$ begin ${statements.join('\n')} end $speaker_sync$; commit;`);
  const current = checked(await db.from('speakers').select('*').eq('event_id', EVENT_ID), 'Verify biographies');
  const currentLinks = checked(await db.from('session_speakers').select('event_id,session_id,speaker_id').eq('event_id', EVENT_ID), 'Verify unchanged links');
  const linkHash = rows => JSON.stringify(rows.map(row => `${row.session_id}:${row.speaker_id}`).sort());
  if (linkHash(links) !== linkHash(currentLinks)) throw new Error('Session links changed during speaker import; inspect before releasing');
  for (const row of plan) {
    const record = current.find(s => s.id === row.id);
    if (!record || record.bio !== row.speaker.bio || record.headshot_url !== row.url) throw new Error(`Speaker did not verify: ${row.speaker.name}`);
  }
  const report = { checked_at: new Date().toISOString(), source_url: official.source_url, project: PROJECT_REF, event: EVENT_ID,
    speakers: current.length, eventWebsiteBiographies: official.speakers.length, supplementalBiographies: supplemental.speakers.length, headshots: current.filter(s => s.headshot_url).length,
    newSpeakers: plan.filter(p => !p.old).map(p => p.speaker.name), missingSource: missing,
    preservedSessionLinks: currentLinks.length, preservedExistingIds: existing.every(old => current.some(s => s.id === old.id)),
    policy: 'Only source-backed speaker biographies and portraits updated. Existing IDs, roles, publications, agenda links, event settings and attendee data preserved.', passed: true };
  writeFileSync('docs/speaker-content-sync.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
