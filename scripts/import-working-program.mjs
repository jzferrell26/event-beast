import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { backendAdmin, query, EVENT_ID, PROJECT_REF } from './backend-cli.mjs';

const schedule = JSON.parse(readFileSync('data/momentum-builder-working-schedule.json', 'utf8'));
const official = JSON.parse(readFileSync('data/official-speakers.json', 'utf8'));
const namespace = Buffer.from('b4fdc249058c4c0f9ba2c36f31f9da73', 'hex');
function id(value) { const hash = createHash('sha1').update(namespace).update(value).digest(); hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128; const hex = hash.subarray(0, 16).toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
const aliases = { 'Coach Michael Burt': 'Michael Burt', 'Coach Bill Hart': 'Bill Hart' };
const canonical = name => aliases[name] ?? name;
const q = value => value === null ? 'null' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, record) => `insert into public.${table} (${Object.keys(record).join(',')}) values (${Object.values(record).map(q).join(',')}) on conflict do nothing;`;
function instant(date, time) {
  if (!['2026-10-06','2026-10-07','2026-10-08'].includes(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Unreviewed date/time in working schedule');
  const result = new Date(`${date}T${time}:00-05:00`);
  if (new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(result) !== time) throw new Error('Event timezone conversion failed');
  return result.toISOString();
}
const adminEmail = process.env.EVENT_BEAST_BOOTSTRAP_ADMIN_EMAIL;
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Set the approved bootstrap Admin email privately before importing.');
const existing = query("select id from public.events where slug='momentum-builder-live-2026'");
if (Array.isArray(existing) && existing[0] && existing[0].id !== EVENT_ID) throw new Error('An event already exists with a different ID; review before importing.');
const db = backendAdmin();
const speakers = new Map();
let uploaded = 0;
for (const speaker of official.speakers) {
  const bytes = readFileSync(`public${speaker.headshot_path}`);
  const basename = speaker.headshot_path.split('/').at(-1).replace('.webp', `-${speaker.image_sha256.slice(0, 12)}.webp`);
  const object = `${EVENT_ID}/speakers/${basename}`;
  const upload = await db.storage.from('event-assets').upload(object, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error(`A speaker image could not be uploaded: ${speaker.name}`);
  if (!upload.error) uploaded++;
  const verify = await db.storage.from('event-assets').download(object);
  if (verify.error || !verify.data?.size) throw new Error(`Stored image verification failed: ${speaker.name}`);
  if (createHash('sha256').update(Buffer.from(await verify.data.arrayBuffer())).digest('hex') !== speaker.image_sha256) throw new Error(`Stored image differs from the reviewed source: ${speaker.name}`);
  speakers.set(speaker.name, { id: id(`speaker:${speaker.name}`), event_id: EVENT_ID, full_name: speaker.name, title: '', bio: speaker.bio,
    headshot_url: `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/event-assets/${object}`, source_url: official.source_url, published: true, is_demo: false });
}
for (const row of schedule.sessions) for (const rawName of row[6]) {
  const name = canonical(rawName);
  if (!speakers.has(name)) speakers.set(name, { id: id(`speaker:${name}`), event_id: EVENT_ID, full_name: name, title: '', bio: '', headshot_url: '', source_url: '', published: true, is_demo: false });
}
const commands = ['begin;', insert('events', { id: EVENT_ID, slug: 'momentum-builder-live-2026', name: 'Momentum Builder LIVE 2026', tagline: 'Build relationships. Create momentum.', timezone: 'America/Chicago', start_date: '2026-10-06', end_date: '2026-10-08', published: true, public_guide: true, is_demo: false }),
  insert('event_settings', { event_id: EVENT_ID, welcome_title: 'Welcome to Momentum Builder LIVE 2026', welcome_body: 'Your event, in your pocket. Explore the working agenda, meet the speakers and make your next connection.', support_email: 'team@momentumbuilder.com', support_location: 'Ask the event welcome desk for help. The exact desk and room locations will be confirmed.', agenda_notice: 'Working agenda · October 6–8. Times, rooms and session details may change as the organizer finalizes the program.', technology_attribution: true, directory_enabled: true, messaging_enabled: true })];
Object.values(schedule.days).forEach((date, index) => commands.push(insert('agenda_days', { id: id(`day:${date}`), event_id: EVENT_ID, label: ['Day 01 · Kickoff', 'Day 02', 'Day 03 · Closing'][index], date, sort_order: index + 1, published: true })));
for (const speaker of speakers.values()) commands.push(insert('speakers', speaker));
for (const [sheet, row, start, end, title, type, names, published, description] of schedule.sessions) {
  const sessionId = id(`schedule:${sheet}:${row}`);
  const starts = instant(schedule.days[sheet], start), ends = instant(schedule.days[sheet], end);
  if (ends <= starts) throw new Error(`Invalid session duration at ${sheet}:${row}`);
  commands.push(insert('agenda_sessions', { id: sessionId, event_id: EVENT_ID, day_id: id(`day:${schedule.days[sheet]}`), title,
    description: published ? description : 'This session is awaiting organizer confirmation.', starts_at: starts, ends_at: ends, room: '', session_type: type, sponsor_id: null, published, is_demo: false }));
  commands.push(insert('agenda_import_notes', { event_id: EVENT_ID, session_id: sessionId, source_sheet: sheet, source_row: row, issue: published ? '' : description }));
  for (const name of names) commands.push(insert('session_speakers', { event_id: EVENT_ID, session_id: sessionId, speaker_id: speakers.get(canonical(name)).id }));
}
commands.push(insert('sponsor_tiers', { id: id('tier:Platinum'), event_id: EVENT_ID, name: 'Platinum', sort_order: 10 }));
commands.push(insert('sponsors', { id: id('sponsor:Cuantico AI'), event_id: EVENT_ID, tier_id: id('tier:Platinum'), name: 'Cuantico AI', description: 'Platinum Sponsor and event technology partner.', logo_url: '', booth: '', cta_label: '', cta_url: '', sort_order: 100, featured: false, published: true, is_demo: false }));
commands.push(insert('venue_locations', { id: id('venue:Hyatt Regency Dallas'), event_id: EVENT_ID, title: 'Hyatt Regency Dallas', location: '300 Reunion Boulevard, Dallas, Texas 75207', description: 'Event venue. Specific session rooms, the registration desk and the event map are awaiting organizer confirmation.', directions_url: 'https://www.google.com/maps/search/?api=1&query=Hyatt+Regency+Dallas+300+Reunion+Boulevard', map_url: '', sort_order: 1, published: true, is_demo: false }));
commands.push(insert('attendees', { id: id(`bootstrap:${adminEmail.toLowerCase()}`), event_id: EVENT_ID, registration_name: 'Jonathan Ferrell', registration_email: adminEmail.toLowerCase(), status: 'approved', access_role: 'admin', directory_allowed: true }));
commands.push('commit;');
query(commands.join('\n'));
const report = { timestamp: new Date().toISOString(), source: schedule.source_url, website: official.source_url, project: PROJECT_REF, event: EVENT_ID,
  days: 3, scheduledRecords: schedule.sessions.length, publishedWorkingSessions: schedule.sessions.filter(row => row[7]).length,
  heldForReview: schedule.sessions.filter(row => !row[7]).map(row => ({ sheet: row[0], row: row[1], title: row[4], issue: row[8] })),
  officialHeadshots: official.speakers.length, uploaded, speakers: speakers.size, missingOfficialHeadshots: [...speakers.values()].filter(speaker => !speaker.headshot_url).map(speaker => speaker.full_name),
  privateSourceExcluded: ['Contact details', 'Travel arrangements', 'Backstage and sales instructions', 'Audio/lighting/video cues', 'Playlist links'],
  importPolicy: 'Create-only stable IDs. Existing organizer edits are preserved on repeat imports. No auth accounts or email invitations are created.' };
mkdirSync('docs', { recursive: true }); writeFileSync('docs/program-import.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ days: report.days, sessions: report.scheduledRecords, publicWorkingSessions: report.publishedWorkingSessions, held: report.heldForReview.length, headshots: report.officialHeadshots, speakers: report.speakers, missingHeadshots: report.missingOfficialHeadshots }));
