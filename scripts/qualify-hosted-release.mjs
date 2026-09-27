import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { backendAdmin, backendEnvironment, query, PROJECT_REF } from './backend-cli.mjs';

// Real-service regression test, not a public-signup or email-delivery test.
// The only created users are synthetic, administratively confirmed identities.
// No SMTP, domain, Auth-provider configuration or real event record is changed.
const stateFile = 'supabase/.temp/service-release-qa.json';
mkdirSync('supabase/.temp', { recursive: true });
const cleanupOnly = process.argv[2] === 'cleanup';
const previous = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
if (previous && !previous.cleanedUp && !cleanupOnly) {
  throw new Error('An earlier synthetic cohort needs scoped cleanup before another run.');
}
const env = backendEnvironment();
const admin = backendAdmin();
const state = cleanupOnly ? previous : { project: PROJECT_REF, event: randomUUID(), slug: `release-qa-${randomUUID()}`, users: [], uploads: [], cleanedUp: false };
if (!state || state.project !== PROJECT_REF || !/^[a-f0-9-]{36}$/.test(state.event) || !/^release-qa-[a-f0-9-]{36}$/.test(state.slug)) throw new Error('Synthetic state identity mismatch');
const save = () => writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
save();
const password = `Qa!${randomUUID()}-9x`;
const clients = [];
const checks = [];
let failedCheck = 'setup';
let failure = false;
let channel;
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code || result.error.status || 'request failed'} ${result.error.message || ''}`); return result.data; };
const client = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const run = async (name, action) => { failedCheck = name; await action(); checks.push({ name, passed: true }); console.log(JSON.stringify(checks.at(-1))); };
try {
  if (!cleanupOnly) {
  checked(await admin.from('events').insert({ id: state.event, slug: state.slug, name: 'Synthetic release qualification', published: false, public_guide: false, is_demo: true }), 'Create isolated event');
  checked(await admin.from('event_settings').insert({ event_id: state.event }), 'Create isolated settings');
  await run('Hosted password sign-in and verified registration claims', async () => {
    for (let index = 0; index < 4; index++) {
      const email = `event-beast-qa-${randomUUID()}@example.test`;
      const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Create synthetic user').user;
      state.users.push({ id: user.id, email }); save();
      const db = client(); clients.push(db);
      checked(await db.auth.signInWithPassword({ email, password }), 'Synthetic password sign-in');
      if (index === 3) continue;
      checked(await admin.from('attendees').insert({ event_id: state.event, registration_email: email, registration_name: `Synthetic attendee ${index}`, access_role: index === 2 ? 'admin' : 'member' }), 'Create synthetic registration');
      const attendee = checked(await db.rpc('claim_attendee', { p_event: state.event }), 'Claim synthetic registration');
      assert.ok(attendee); state.users[index].attendee = attendee; save();
    }
  });
  const [alice, bob, organizer, outsider] = clients;
  await run('Anonymous private RPC denial and default-private attendee profiles', async () => {
    const anon = client();
    assert.ok((await anon.rpc('open_conversation', { p_event: state.event, p_recipient: state.users[1].attendee })).error);
    assert.ok((await anon.rpc('claim_attendee', { p_event: state.event })).error);
    const profiles = checked(await alice.from('attendee_profiles').select('attendee_id').eq('event_id', state.event), 'Private profiles');
    assert.equal(profiles.length, 1);
    for (const [index, db] of [alice, bob].entries()) checked(await db.from('attendee_profiles').update({ directory_visible: true, messaging_available: true }).eq('attendee_id', state.users[index].attendee), 'Synthetic opt-in');
  });
  const conversation = checked(await alice.rpc('open_conversation', { p_event: state.event, p_recipient: state.users[1].attendee }), 'Open synthetic conversation');
  let signals = 0;
  await run('Private Realtime delivery, durable sends, duplicate retry and read state', async () => {
    const session = checked(await bob.auth.getSession(), 'Read synthetic session').session;
    await bob.realtime.setAuth(session.access_token);
    channel = bob.channel(`event:${state.event}:attendee:${state.users[1].attendee}`, { config: { private: true } }).on('broadcast', { event: 'changed' }, () => { signals += 1; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Private subscription timed out')), 15000);
      channel.subscribe((status, error) => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error(`Private subscription ${status}: ${error?.message || 'No transport detail'}`)); } });
    });
    const payload = { p_event: state.event, p_conversation: conversation, p_client_id: randomUUID(), p_body: 'Synthetic durable release test' };
    const first = checked(await alice.rpc('send_message', payload), 'Send synthetic message');
    const second = checked(await alice.rpc('send_message', payload), 'Retry same message');
    assert.deepEqual(first, second);
    const messages = checked(await bob.from('messages').select('id').eq('event_id', state.event).eq('conversation_id', conversation), 'Read durable history');
    assert.equal(messages.length, 1);
    checked(await bob.rpc('mark_conversation_read', { p_event: state.event, p_conversation: conversation, p_message_id: messages[0].id }), 'Mark read');
    const deadline = Date.now() + 10000;
    while (!signals && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(signals > 0, 'A real private broadcast must arrive');
    const inbox = checked(await alice.rpc('list_inbox', { p_event: state.event, p_offset: 0, p_limit: 31 }), 'Read inbox');
    assert.equal(inbox.length, 1); assert.equal(Number(inbox[0].peer_read_id), Number(messages[0].id));
    assert.equal(checked(await outsider.from('messages').select('id').eq('event_id', state.event), 'Unrelated history').length, 0);
  });
  await run('Blocking rejects new messages at the hosted database boundary', async () => {
    checked(await bob.rpc('set_attendee_block', { p_event: state.event, p_target: state.users[0].attendee, p_blocked: true }), 'Block synthetic attendee');
    assert.ok((await alice.rpc('send_message', { p_event: state.event, p_conversation: conversation, p_client_id: randomUUID(), p_body: 'This synthetic send must be rejected' })).error);
  });
  await run('Admin-only audited program decisions and automatic reopening', async () => {
    const day = randomUUID(), session = randomUUID();
    checked(await admin.from('agenda_days').insert({ id: day, event_id: state.event, label: 'Synthetic day', date: '2026-10-06' }), 'Create synthetic day');
    checked(await admin.from('agenda_sessions').insert({ id: session, event_id: state.event, day_id: day, title: 'Synthetic working session', starts_at: '2026-10-06T14:00:00Z', ends_at: '2026-10-06T15:00:00Z', published: true }), 'Create synthetic session');
    checked(await admin.from('agenda_import_notes').insert({ event_id: state.event, session_id: session, source_sheet: 'Synthetic', source_row: 1, issue: 'Synthetic question only' }), 'Create synthetic review');
    const payload = { p_event: state.event, p_session: session, p_status: 'confirmed', p_notes: 'Synthetic verification, not organizer approval', p_expected_version: 0 };
    assert.ok((await alice.rpc('record_agenda_review', payload)).error);
    checked(await organizer.rpc('record_agenda_review', payload), 'Record synthetic decision');
    checked(await organizer.from('agenda_sessions').update({ title: 'Changed synthetic session' }).eq('id', session).eq('event_id', state.event), 'Edit synthetic content');
    const review = checked(await organizer.from('agenda_import_notes').select('review_status,review_version').eq('session_id', session).single(), 'Read reopened decision');
    assert.equal(review.review_status, 'pending'); assert.equal(review.review_version, 2);
    assert.equal(checked(await bob.from('agenda_import_notes').select('session_id').eq('event_id', state.event), 'Member private review').length, 0);
  });
  await run('Private storage uploads and outsider denial', async () => {
    const path = `${state.event}/${state.users[0].attendee}/release-test.png`;
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVv0AAAAASUVORK5CYII=', 'base64');
    state.uploads.push(path); save();
    checked(await alice.storage.from('event-headshots').upload(path, image, { contentType: 'image/png' }), 'Upload synthetic headshot');
    assert.ok(checked(await alice.storage.from('event-headshots').createSignedUrl(path, 30), 'Own signed image').signedUrl);
    assert.ok((await outsider.storage.from('event-headshots').createSignedUrl(path, 30)).error);
  });
  await run('Refresh-token renewal and revoked event access despite a retained login', async () => {
    assert.ok(checked(await alice.auth.refreshSession(), 'Renew synthetic session').session);
    checked(await admin.from('attendees').update({ status: 'disabled' }).eq('event_id', state.event).eq('id', state.users[0].attendee), 'Disable synthetic membership');
    assert.equal(checked(await alice.from('messages').select('id').eq('event_id', state.event), 'Revoked private history').length, 0);
  });
  }
} catch (error) {
  failure = true;
  writeFileSync('supabase/.temp/service-release-error.log', String(error.stack || error), { mode: 0o600 });
  console.error(JSON.stringify({ failedCheck, errorType: error.name, details: 'Ignored private qualification log' }));
} finally {
  try {
    if (channel && clients[1]) await clients[1].removeChannel(channel);
    for (const db of clients) { await db.removeAllChannels(); await db.auth.signOut({ scope: 'local' }); }
    if (state.project !== PROJECT_REF || !state.slug.startsWith('release-qa-')) throw new Error('Cleanup scope mismatch');
    if (state.uploads.some(path => !path.startsWith(`${state.event}/`))) throw new Error('Upload cleanup scope mismatch');
    if (state.uploads.length) checked(await admin.storage.from('event-headshots').remove(state.uploads), 'Remove synthetic uploads');
    // Remove children while their event still exists: organizer audit triggers
    // append rows on deletion and would otherwise hit a missing parent FK.
    const events = checked(await admin.from('events').select('slug').eq('id', state.event), 'Check cleanup scope');
    if (events.length) {
      assert.equal(events[0].slug, state.slug);
      const tables = ['reports','conversation_reads','messages','conversations','blocks','saved_sessions','saved_attendees','sponsor_editors','sponsor_representatives','attendee_contacts','attendee_preferences','attendee_profiles','attendees','event_admins','agenda_sponsor_placements','session_speakers','agenda_import_notes','agenda_sessions','agenda_days','speakers','sponsors','sponsor_tiers','lunch_locations','venue_locations','announcements','launch_checks','event_settings','audit_log'];
      query(`begin;\n${tables.map(table => `delete from public.${table} where event_id='${state.event}';`).join('\n')}\ndelete from public.events where id='${state.event}' and slug='${state.slug}';\ncommit;`);
    }
    for (const user of state.users) {
      if (!user.email.startsWith('event-beast-qa-') || !user.email.endsWith('@example.test')) throw new Error('Synthetic user cleanup scope mismatch');
      checked(await admin.auth.admin.deleteUser(user.id), 'Remove synthetic identity');
    }
    state.cleanedUp = true; save();
  } catch (error) { failure = true; writeFileSync('supabase/.temp/service-release-cleanup-error.log', String(error.stack || error), { mode: 0o600 }); console.error(JSON.stringify({ cleanupFailed: true, errorType: error.name, stateFile })); }
  mkdirSync('docs', { recursive: true });
  const report = { checkedAt: new Date().toISOString(), project: PROJECT_REF, passed: !failure, checks, syntheticAccounts: state.users.length, cleanedUp: state.cleanedUp,
    realSupabaseServices: true, publicSignupTested: false, emailDeliveryTested: false, browserFlowsTested: false, domainConfigurationChanged: false };
  if (!cleanupOnly) writeFileSync('docs/hosted-release-regression.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: !failure, checks: checks.length, cleanedUp: state.cleanedUp }));
  if (failure) process.exitCode = 1;
}
