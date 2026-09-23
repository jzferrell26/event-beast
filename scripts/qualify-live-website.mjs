import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { backendEnvironment, backendAdmin, query, PROJECT_REF } from './backend-cli.mjs';

// Uses the real dedicated Supabase services and the synthetic cohort only.
// Tokens/passwords remain in memory or ignored local state, never in reports.
const statePath = 'supabase/.temp/auth-qualification.json';
const state = JSON.parse(readFileSync(statePath, 'utf8'));
if (state.project !== PROJECT_REF || state.phase !== 'qualified' || !state.slug.startsWith('qualification-')) throw new Error('Qualified synthetic cohort required.');
const env = backendEnvironment();
const admin = backendAdmin();
const origin = process.env.EVENT_BEAST_QA_ORIGIN || 'http://127.0.0.1:3101';
if (!['http://127.0.0.1:3101'].includes(origin)) throw new Error('Review a new QA origin before running.');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
state.sponsorId ??= randomUUID(); state.otherSponsorId ??= randomUUID();
writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
query(`begin;
  insert into public.sponsors(id,event_id,name,description,published) values
    (${q(state.sponsorId)},${q(state.event)},'Synthetic sponsor','Test page',true),
    (${q(state.otherSponsorId)},${q(state.event)},'Other synthetic sponsor','Restricted test page',true) on conflict do nothing;
  insert into public.sponsor_editors(event_id,sponsor_id,attendee_id) values(${q(state.event)},${q(state.sponsorId)},${q(state.users[1].attendeeId)}) on conflict do nothing;
  delete from public.blocks where event_id=${q(state.event)};
  update public.attendees set status='approved' where event_id=${q(state.event)} and id in (${q(state.users[2].attendeeId)},${q(state.users[3].attendeeId)});
  commit;`);

const checks = [], uploaded = [];
let activeCheck = 'initialization';
let browser;
async function check(name, action) {
  activeCheck = name;
  const start = performance.now();
  await action();
  checks.push({ name, passed: true, seconds: Number(((performance.now() - start) / 1000).toFixed(2)) });
  console.log(JSON.stringify(checks.at(-1)));
}
async function api(context, path, method = 'GET', data, expected = 200) {
  const response = await context.request.fetch(origin + path, { method, data, headers: { Origin: origin }, timeout: 45000 });
  if (response.status() !== expected) throw new Error(`${method} ${path.split('?')[0]} returned ${response.status()}, expected ${expected}.`);
  return await response.json();
}
async function login(context, index, throughUi = false) {
  if (throughUi) {
    const page = await context.newPage();
    await page.goto(origin + '/auth?next=/inbox');
    await page.locator('input[autocomplete="email"]').fill(state.users[index].email);
    await page.locator('input[autocomplete="current-password"]').fill(state.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(origin + '/inbox', { timeout: 60000 });
    return page;
  }
  await api(context, '/api/auth', 'POST', { action: 'sign-in', email: state.users[index].email, password: state.password, next: '/' });
}
try {
  browser = await chromium.launch();
  let a = await browser.newContext(), b = await browser.newContext();
  let pageA, pageB;
  await check('Website password sign-in and verified roster matching', async () => {
    pageA = await login(a, 2, true); pageB = await login(b, 3, true);
    for (const [context, index] of [[a, 2], [b, 3]]) {
      const me = await api(context, '/api/me');
      expect(me.eligible).toBe(true); expect(me.attendeeId).toBe(state.users[index].attendeeId);
      expect(me.role).toBe('member');
    }
  });
  await check('Persistent cookie survives browser-context reopen without credentials', async () => {
    const saved = await b.storageState();
    const cookies = saved.cookies.filter(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.every(cookie => cookie.expires > Date.now() / 1000 + 86400)).toBe(true);
    await b.close(); b = await browser.newContext({ storageState: saved }); pageB = await b.newPage();
    await pageB.goto(origin + '/inbox');
    await expect(pageB.getByRole('heading', { name: 'Keep in touch.' })).toBeVisible();
    await pageB.goto(origin + '/auth?next=/inbox');
    await expect(pageB).toHaveURL(origin + '/inbox');
  });

  let conversation, broadcasts = 0;
  const message = `Realtime qualification ${randomUUID().slice(0, 8)}`;
  await check('Real private Realtime delivers a durable message between two browsers', async () => {
    conversation = (await api(a, '/api/inbox', 'POST', { recipient: state.users[3].attendeeId }, 201)).id;
    await pageB.close(); pageB = await b.newPage();
    pageB.on('websocket', socket => socket.on('framereceived', frame => {
      const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8');
      if (payload.includes('changed') && payload.includes(conversation)) broadcasts++;
    }));
    await pageA.goto(`${origin}/inbox/${conversation}`);
    await pageB.goto(`${origin}/inbox/${conversation}`);
    await expect(pageB.locator('.thread-person > span')).toHaveText('Private conversation', { timeout: 20000 });
    await pageA.getByRole('textbox', { name: 'Your message' }).fill(message);
    await pageA.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(pageB.getByText(message, { exact: true })).toBeVisible({ timeout: 10000 });
    expect(broadcasts).toBeGreaterThan(0);
    await pageB.reload();
    await expect(pageB.getByText(message, { exact: true })).toBeVisible();
  });
  await check('Identical send retries return the same durable row', async () => {
    const payload = { client_id: randomUUID(), body: `Idempotent ${randomUUID().slice(0, 8)}` };
    const first = await api(a, `/api/inbox/${conversation}`, 'POST', payload, 201);
    const retry = await api(a, `/api/inbox/${conversation}`, 'POST', payload, 201);
    expect(retry.message.id).toBe(first.message.id);
    const rows = query(`select count(*)::int as count from public.messages where event_id=${q(state.event)} and client_id=${q(payload.client_id)}`);
    expect(rows[0].count).toBe(1);
  });
  await check('Offline recipient catches up and blocking rejects a new send', async () => {
    await b.setOffline(true);
    const body = `Reconnect ${randomUUID().slice(0, 8)}`;
    await api(a, `/api/inbox/${conversation}`, 'POST', { client_id: randomUUID(), body }, 201);
    await b.setOffline(false);
    await pageB.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(pageB.getByText(body, { exact: true })).toBeVisible({ timeout: 15000 });
    await api(b, '/api/moderation', 'POST', { action: 'block', target: state.users[2].attendeeId, blocked: true });
    await api(a, `/api/inbox/${conversation}`, 'POST', { client_id: randomUUID(), body: 'Blocked test' }, 403);
    await api(b, '/api/moderation', 'POST', { action: 'block', target: state.users[2].attendeeId, blocked: false });
  });
  await check('Real Storage headshot upload is confirmed and private profile projection stays clean', async () => {
    const response = await a.request.post(origin + '/api/uploads', { headers: { Origin: origin }, multipart: { kind: 'headshot', file: { name: 'qa.png', mimeType: 'image/png', buffer: readFileSync('public/icons/icon-192.png') } } });
    expect(response.status()).toBe(200);
    const photo = await response.json(); uploaded.push({ bucket: 'event-headshots', path: photo.path });
    const me = await api(a, '/api/me');
    const profile = Object.fromEntries(Object.entries(me.profile).filter(([key]) => !['attendee_id', 'event_id', 'avatar_url'].includes(key)));
    await api(a, '/api/profile', 'PATCH', { ...profile, headshot_path: photo.path });
    const visible = await api(b, `/api/people/${state.users[2].attendeeId}`);
    for (const field of ['public_email', 'public_phone', 'website', 'registration_email', 'phone', 'contact_email']) expect(visible.profile).not.toHaveProperty(field);
    expect(visible.profile.avatar_url).toContain('token=');
    expect((await b.request.get(visible.profile.avatar_url)).status()).toBe(200);
    await api(b, `/api/admin/contacts/${state.users[2].attendeeId}`, 'GET', undefined, 403);
  });
  const retainedA = await a.storageState();
  await a.close(); a = await browser.newContext(); await login(a, 1);
  await check('Sponsor can update only assigned page and cannot read attendee contacts', async () => {
    const own = (await api(a, `/api/sponsor/${state.sponsorId}`)).sponsor;
    await api(a, `/api/sponsor/${state.otherSponsorId}`, 'GET', undefined, 403);
    await api(a, `/api/admin/contacts/${state.users[2].attendeeId}`, 'GET', undefined, 403);
    await api(a, '/api/admin/users', 'GET', undefined, 403);
    const values = { name: own.name, description: 'Updated by assigned synthetic sponsor', logo_url: '', booth: '', cta_label: '', cta_url: '' };
    await api(a, `/api/sponsor/${own.id}`, 'PATCH', { expected_version: own.content_version, values });
    await api(a, `/api/sponsor/${own.id}`, 'PATCH', { expected_version: own.content_version + 1, values: { ...values, tier_id: null } }, 400);
  });
  await a.close(); a = await browser.newContext(); await login(a, 0);
  await check('Admin can read private contact data; unrelated inbox history remains private', async () => {
    const contact = await api(a, `/api/admin/contacts/${state.users[2].attendeeId}`);
    expect(contact.phone).toBe('555-123-4567'); expect(contact.contact_email).toBe('qa-private@example.test');
    await api(a, `/api/inbox/${conversation}`, 'GET', undefined, 404);
    expect((await api(a, '/api/admin/users')).rows.length).toBeGreaterThan(0);
  });
  await check('Password recovery link changes the password without exposing another account', async () => {
    const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email: state.users[4].email });
    if (recovery.error) throw new Error('Synthetic recovery link could not be generated.');
    await a.close(); a = await browser.newContext(); const recoveryPage = await a.newPage();
    await recoveryPage.goto(`${origin}/auth/confirm?token_hash=${encodeURIComponent(recovery.data.properties.hashed_token)}&type=recovery`);
    await expect(recoveryPage).toHaveURL(origin + '/reset-password');
    const password = `${state.password}-changed`;
    await recoveryPage.locator('input[autocomplete="new-password"]').nth(0).fill(password);
    await recoveryPage.locator('input[autocomplete="new-password"]').nth(1).fill(password);
    await recoveryPage.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(recoveryPage).toHaveURL(origin + '/', { timeout: 15000 });
    await api(a, '/api/auth', 'POST', { action: 'sign-out' });
    await api(a, '/api/auth', 'POST', { action: 'sign-in', email: state.users[4].email, password: state.password }, 400);
    await api(a, '/api/auth', 'POST', { action: 'sign-in', email: state.users[4].email, password });
    await admin.auth.admin.updateUserById(state.users[4].userId, { password: state.password });
  });
  await check('Refresh-token session renewal works against hosted Auth', async () => {
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signedIn = await db.auth.signInWithPassword({ email: state.users[5].email, password: state.password });
    expect(signedIn.error).toBeNull();
    const renewed = await db.auth.refreshSession();
    expect(renewed.error).toBeNull(); expect(renewed.data.session?.user.id).toBe(state.users[5].userId);
    await db.auth.signOut({ scope: 'local' });
  });
  await a.close(); a = await browser.newContext({ storageState: retainedA });
  await check('Disabled membership denies private routes despite a retained login', async () => {
    query(`update public.attendees set status='disabled' where event_id=${q(state.event)} and id=${q(state.users[2].attendeeId)}`);
    expect((await api(a, '/api/me')).eligible).toBe(false);
    await api(a, `/api/inbox/${conversation}`, 'GET', undefined, 403);
    const page = await a.newPage(); await page.goto(origin + '/people');
    // The client boundary can display the access explanation in place before a
    // streamed server redirect is applied. The private view must be unmounted.
    await expect(page.locator('#main').getByText(/Your event access (is|has been) paused/)).toBeVisible();
    await expect(page.locator('.person-card')).toHaveCount(0);
    query(`update public.attendees set status='approved' where event_id=${q(state.event)} and id=${q(state.users[2].attendeeId)}`);
  });
  writeFileSync('docs/hosted-website-qualification.json', JSON.stringify({ timestamp: new Date().toISOString(), project: PROJECT_REF, syntheticEvent: state.event, appOrigin: origin, actualSupabaseServices: true, browser: 'Chromium', passed: true, realInboxDeliveryVerified: false, actualPhysicalDevicesVerified: false, checks }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, realInboxDeliveryVerified: false }));
} catch (error) {
  mkdirSync('supabase/.temp', { recursive: true });
  writeFileSync('supabase/.temp/browser-qualification-error.log', String(error.stack || error));
  writeFileSync('docs/hosted-website-qualification.json', JSON.stringify({ timestamp: new Date().toISOString(), project: PROJECT_REF, passed: false, failedCheck: activeCheck, checks }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: false, failedCheck: activeCheck, errorType: error.name, details: 'Ignored private browser error log' }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const item of uploaded) {
    if (!item.path.startsWith(state.event + '/')) throw new Error('Upload cleanup scope mismatch');
    await admin.storage.from(item.bucket).remove([item.path]);
  }
}
