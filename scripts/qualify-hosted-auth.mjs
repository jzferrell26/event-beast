import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { backendEnvironment, backendAdmin, query, PROJECT_REF } from './backend-cli.mjs';

const action = process.argv[2];
const statePath = 'supabase/.temp/auth-qualification.json';
const configRoot = 'supabase/.temp/auth-qualification-config';
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const config = enabled => `project_id = "event-beast-qualification"\n[remotes.qualification]\nproject_id = "${PROJECT_REF}"\n[remotes.qualification.auth.hook.send_email]\nenabled = ${enabled}\nuri = "${enabled ? 'pg-functions://postgres/public/event_beast_qualification_email' : ''}"\n[remotes.qualification.auth.rate_limit]\nemail_sent = ${enabled ? 2000 : 2}\n`;
function writeConfig(enabled) { mkdirSync(`${configRoot}/supabase`, { recursive: true }); writeFileSync(`${configRoot}/supabase/config.toml`, config(enabled)); }
function readState() { const state = JSON.parse(readFileSync(statePath, 'utf8')); if (state.project !== PROJECT_REF || !/^[a-f0-9]{12}$/.test(state.run)) throw new Error('Invalid qualification scope'); return state; }
function saveState(state) { writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

if (action === 'prepare') {
  if (existsSync(statePath)) throw new Error('A qualification cohort already exists. Resume or clean it up instead of creating duplicate accounts.');
  const run = randomBytes(6).toString('hex'), event = randomUUID();
  const state = { project: PROJECT_REF, run, event, slug: `qualification-${run}`, password: `Qa-${randomBytes(24).toString('base64url')}!`, count: 500, users: Array.from({ length: 500 }, (_, i) => ({ email: `ebqa-${run}-${i}@example.test`, attendeeId: randomUUID() })), sessions: [], phase: 'prepared' };
  const rows = state.users.map((user, index) => `(${q(user.attendeeId)},${q(event)},${q(user.email)},${q(`QA Attendee ${index}`)},'approved','member')`).join(',');
  query(`begin;
    create schema if not exists event_beast_qualification;
    revoke all on schema event_beast_qualification from public,anon,authenticated;
    create table if not exists event_beast_qualification.mail (email text primary key, user_id uuid not null, token text not null, token_hash text not null, action text not null, captured_at timestamptz not null default now());
    revoke all on event_beast_qualification.mail from public,anon,authenticated;
    create or replace function public.event_beast_qualification_email(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $hook$
    declare v_email text := payload->'user'->>'email'; v_data jsonb := coalesce(payload->'email_data',payload->'email');
    begin
      if v_email !~ '^ebqa-[a-f0-9]{12}-[0-9]+@example[.]test$' then
        return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Live email delivery has not been activated.'));
      end if;
      insert into event_beast_qualification.mail(email,user_id,token,token_hash,action)
        values(v_email,(payload->'user'->>'id')::uuid,v_data->>'token',v_data->>'token_hash',v_data->>'email_action_type')
        on conflict(email) do update set token=excluded.token,token_hash=excluded.token_hash,action=excluded.action,captured_at=now();
      return '{}'::jsonb;
    end $hook$;
    revoke all on function public.event_beast_qualification_email(jsonb) from public,anon,authenticated;
    grant execute on function public.event_beast_qualification_email(jsonb) to supabase_auth_admin;
    insert into public.events(id,slug,name,start_date,end_date,published,public_guide,is_demo) values(${q(event)},${q(state.slug)},'Event Beast QA — synthetic accounts','2026-10-06','2026-10-08',true,true,true);
    insert into public.event_settings(event_id,welcome_title,welcome_body,support_location) values(${q(event)},'Event Beast live qualification','Synthetic test event. No real attendees.','QA only');
    insert into public.attendees(id,event_id,registration_email,registration_name,status,access_role) values ${rows};
    commit;`);
  saveState(state); writeConfig(true);
  console.log(JSON.stringify({ phase: state.phase, cohort: state.count, synthetic: true, emailDelivery: 'Private test capture only; no emails sent to real inboxes.', configRoot }));
} else if (action === 'smoke') {
  const state = readState(), env = backendEnvironment();
  const emails = [800, 801, 802].map(index => `ebqa-${state.run}-${index}@example.test`);
  const results = [];
  for (const email of emails) {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: state.password }), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    results.push({ status: response.status, code: data.error_code ?? data.code ?? null });
  }
  const captured = query(`select count(*)::int as count from event_beast_qualification.mail where email in (${emails.map(q).join(',')})`);
  console.log(JSON.stringify({ smoke: results, captured: captured[0]?.count ?? null, realEmailsSent: 0 }));
  const users = query(`select id from auth.users where email in (${emails.map(q).join(',')})`);
  const admin = backendAdmin();
  for (const user of users) { const result = await admin.auth.admin.deleteUser(user.id); if (result.error) throw new Error('Smoke fixture cleanup failed'); }
  query(`delete from event_beast_qualification.mail where email in (${emails.map(q).join(',')})`);
  if (results.some(result => result.status !== 200) || captured[0]?.count !== 3) throw new Error('Email hook/limit smoke did not pass. The 500-person burst has not run.');
} else if (action === 'seed-links') {
  const state = readState();
  if (!['prepared', 'seeding-links'].includes(state.phase)) throw new Error('This cohort cannot be seeded again.');
  state.phase = 'seeding-links'; saveState(state);
  const admin = backendAdmin();
  for (let at=0; at<state.users.length; at+=8) {
    await Promise.all(state.users.slice(at, at+8).map(async user => {
      if (user.emailOtp && user.userId) return;
      const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email: user.email, password: state.password, options: { data: { event_beast_qa: state.run } } });
      if (error || !data.properties?.email_otp || !data.user?.id) throw new Error('Synthetic signup-link preparation failed. No real emails were sent.');
      user.emailOtp = data.properties.email_otp; user.userId = data.user.id;
    }));
    saveState(state);
    if (at % 80 === 0) console.log(JSON.stringify({ preparedSyntheticLinks: Math.min(at+8, state.count), total: state.count, realEmailsSent: 0 }));
  }
  state.phase = 'links-seeded'; saveState(state);
  console.log(JSON.stringify({ preparedSyntheticLinks: state.count, emailDeliveryQualified: false, publicSignupBurstQualified: false }));
} else if (action === 'burst') {
  const state = readState();
  if (!['prepared', 'links-seeded'].includes(state.phase)) throw new Error('This cohort has already run. Inspect its report before doing more work.');
  const adminPreparedLinks = state.phase === 'links-seeded';
  const env = backendEnvironment();
  const endpoint = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const phases = [];
  async function batch(name, operation) {
    const started = performance.now(), timings = [], errors = [], statusCounts = {};
    let completed = 0, retries = 0;
    const results = await Promise.all(state.users.map(async (user, index) => {
      const begin = performance.now();
      try {
        for (let attempt = 0; attempt < 7; attempt++) {
          const { path, body, token } = operation(user, index);
          const response = await fetch(`${endpoint}/auth/v1/${path}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
          statusCounts[response.status] = (statusCounts[response.status] ?? 0) + 1;
          const data = await response.json();
          if (response.ok) { timings.push(performance.now() - begin); completed++; return data; }
          if (response.status === 429 && data.error_code !== 'over_email_send_rate_limit' && attempt < 6) { retries++; await wait(5000 + Math.random() * 3000); continue; }
          errors.push({ index, status: response.status, code: data.error_code ?? data.code ?? 'auth_error' }); return null;
        }
      } catch (error) { errors.push({ index, code: error.name }); }
      return null;
    }));
    timings.sort((a,b) => a-b);
    const report = { phase: name, requested: state.count, completed, failures: errors.length, elapsedSeconds: Number(((performance.now()-started)/1000).toFixed(2)), p50Seconds: Number(((timings[Math.floor(timings.length*0.5)] ?? 0)/1000).toFixed(2)), p95Seconds: Number(((timings[Math.floor(timings.length*0.95)] ?? 0)/1000).toFixed(2)), retries, statusCounts, errors };
    phases.push(report); console.log(JSON.stringify(report));
    if (errors.length || completed !== state.count) throw new Error(`The ${name} burst did not qualify all 500 requests.`);
    return results;
  }
  try {
    if (!adminPreparedLinks) await batch('signup', user => ({ path: 'signup', body: { email: user.email, password: state.password, data: { event_beast_qa: state.run } } }));
    const mail = adminPreparedLinks ? state.users.map(user => ({ email: user.email, token: user.emailOtp, user_id: user.userId })) : query(`select email,token,user_id from event_beast_qualification.mail where email like ${q(`ebqa-${state.run}-%@example.test`)}`);
    if (!Array.isArray(mail) || mail.length !== state.count) throw new Error('Not every signup produced a captured verification email.');
    const tokens = new Map(mail.map(row => [row.email, row]));
    const verified = await batch('verification', user => ({ path: 'verify', body: { type: 'signup', email: user.email, token: tokens.get(user.email).token } }));
    state.users.forEach((user, index) => { user.userId = verified[index].user.id; });
    const signedIn = await batch('password_sign_in', user => ({ path: 'token?grant_type=password', body: { email: user.email, password: state.password } }));
    const claimStart = performance.now();
    let claims = 0;
    await Promise.all(signedIn.map(async session => {
      const response = await fetch(`${endpoint}/rest/v1/rpc/claim_attendee`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_event: state.event }), signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Registration claim failed: ${response.status}`);
      const id = await response.json(); if (!id) throw new Error('Verified signup was not matched to its seeded registration'); claims++;
    }));
    phases.push({ phase: 'registration_claim', requested: state.count, completed: claims, failures: state.count-claims, elapsedSeconds: Number(((performance.now()-claimStart)/1000).toFixed(2)) });
    state.sessions = signedIn.slice(0, 4); state.phase = 'qualified'; saveState(state);
    query(`update public.attendees set access_role='admin' where id=${q(state.users[0].attendeeId)};
      update public.attendees set access_role='sponsor' where id=${q(state.users[1].attendeeId)};
      insert into public.attendee_contacts(event_id,attendee_id,contact_email,phone) values(${q(state.event)},${q(state.users[2].attendeeId)},'qa-private@example.test','555-123-4567') on conflict do nothing;
      update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=${q(state.event)} and attendee_id in (${q(state.users[2].attendeeId)},${q(state.users[3].attendeeId)});`);
    const report = { timestamp: new Date().toISOString(), project: PROJECT_REF, cohort: state.count, arrivalPattern: '500 requests started together from one client IP in each measured phase; explicit HTTP 429 responses retried with the website retry policy.',
      accountPreparation: adminPreparedLinks ? 'Admin-generated signup verification links for synthetic accounts, prepared in batches of 8. This is not a public-signup throughput test.' : 'Public signup API with private test email capture.',
      publicSignupBurstQualified: !adminPreparedLinks, emailDeliveryQualified: false,
      emailDelivery: 'Real inbox/provider delivery is NOT qualified. The public signup smoke encountered the built-in 2-email/hour project limit; a production sender is still required.', passed: true, phases };
    writeFileSync('docs/hosted-auth-burst.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, cohort: state.count, report: 'docs/hosted-auth-burst.json' }));
  } catch (error) {
    state.phase = 'needs_review'; saveState(state);
    writeFileSync('docs/hosted-auth-burst.json', JSON.stringify({ timestamp: new Date().toISOString(), project: PROJECT_REF, passed: false, emailDelivery: 'Test capture only', phases, error: error.message }, null, 2) + '\n');
    throw error;
  }
} else if (action === 'prepare-restore') {
  readState(); writeConfig(false);
  console.log('Prepared removal of the temporary email hook and restoration of the built-in email limit. Review config diff before pushing.');
} else if (action === 'cleanup') {
  const state = readState();
  const scoped = query(`select slug from public.events where id=${q(state.event)}`);
  if (!Array.isArray(scoped) || scoped[0]?.slug !== state.slug) throw new Error('Synthetic event identity check failed; cleanup stopped.');
  const authUsers = query(`select id from auth.users where email like ${q(`ebqa-${state.run}-%@example.test`)}`);
  const tables = ['reports','conversation_reads','messages','conversations','blocks','saved_sessions','saved_attendees','sponsor_editors','sponsor_representatives','attendee_contacts','attendee_preferences','attendee_profiles','attendees','event_admins','agenda_sponsor_placements','session_speakers','agenda_import_notes','agenda_sessions','agenda_days','speakers','sponsors','sponsor_tiers','lunch_locations','venue_locations','announcements','launch_checks','event_settings','audit_log'];
  query(`begin;\n${tables.map(table => `delete from public.${table} where event_id=${q(state.event)};`).join('\n')}\ndelete from public.events where id=${q(state.event)};\ncommit;`);
  const db = backendAdmin();
  let removed = 0;
  for (let at=0; at<authUsers.length; at+=8) await Promise.all(authUsers.slice(at,at+8).map(async user => { const result=await db.auth.admin.deleteUser(user.id); if(result.error) throw new Error('Synthetic account cleanup failed'); removed++; }));
  query(`drop function if exists public.event_beast_qualification_email(jsonb); drop table if exists event_beast_qualification.mail; drop schema if exists event_beast_qualification;`);
  state.phase='cleaned'; state.password=''; state.sessions=[];
  for (const user of state.users) delete user.emailOtp;
  saveState(state);
  console.log(JSON.stringify({ cleaned: true, syntheticAuthUsersRemoved: removed, realAttendeesTouched: 0 }));
} else {
  console.log('Use prepare, smoke, seed-links, burst, prepare-restore, or cleanup. Only the dedicated Event Beast project and a generated synthetic cohort are supported.');
}
