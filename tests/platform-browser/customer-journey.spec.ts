import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://127.0.0.1:3190';
const password = process.env.PLATFORM_TEST_PASSWORD;
async function signIn(page: Page, actor: string, next = '/app') {
  if (!password) throw new Error('Run through scripts/qualify-platform-local.mjs.');
  await page.goto(`/platform/auth?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill(`${actor}@platform.example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin}${next}`);
}
async function write(context: BrowserContext, path: string, data: unknown, method = 'POST') {
  return context.request.fetch(`${origin}${path}`, { method, headers: { Origin: origin }, data });
}
async function section(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Event sections' }).getByRole('button', { name, exact: true }).click();
}
async function saveRecord(page: Page) {
  await page.locator('form.platform-editor').getByLabel('Published in the attendee guide').check();
  await page.locator('form.platform-editor').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('form.platform-editor')).toHaveCount(0);
}

test('agency handoff, customer publishing, second-customer isolation and recovery', async ({ browser }, info) => {
  const contexts: BrowserContext[] = [];
  const newContext = async () => { const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } }); context.setDefaultTimeout(15_000); contexts.push(context); return context; };
  try {
    const agency = await newContext(); const agencyPage = await agency.newPage();
    await signIn(agencyPage, 'agency', '/agency');
    await agencyPage.getByRole('button', { name: 'New subaccount', exact: true }).click();
    await agencyPage.getByLabel('Customer name').fill('Sample Alpha Events');
    await agencyPage.locator('input[name="slug"]').fill('sample-alpha');
    await agencyPage.getByLabel('Owner email').fill('alpha@platform.example.test');
    await agencyPage.locator('input[name="event_limit"]').fill('3');
    await agencyPage.getByRole('button', { name: 'Create subaccount', exact: true }).click();
    await expect(agencyPage.getByRole('heading', { name: 'Sample Alpha Events', exact: true })).toBeVisible();
    const secondRequest = { request_id: randomUUID(), name: 'Sample Beta Events', slug: 'sample-beta', owner_email: 'beta@platform.example.test', event_limit: 1 };
    const second = await write(agency, '/api/platform/agency', secondRequest);
    expect(second.status()).toBe(201);
    const betaOrg = await second.json();
    expect((await (await write(agency, '/api/platform/agency', secondRequest)).json()).id).toBe(betaOrg.id);
    await agencyPage.reload();
    await expect(agencyPage.getByRole('heading', { name: 'Sample Beta Events', exact: true })).toBeVisible();
    await agencyPage.screenshot({ path: info.outputPath('agency-desktop.png'), fullPage: true });

    const alpha = await newContext(); const owner = await alpha.newPage();
    await signIn(owner, 'alpha');
    await owner.getByRole('button', { name: 'Accept invitation' }).click();
    await owner.locator('a.platform-workspace-link').filter({ hasText: 'Sample Alpha Events' }).click();
    await expect(owner.getByRole('heading', { name: 'Sample Alpha Events', exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Create your first event' }).click();
    await owner.getByLabel('Event name', { exact: true }).fill('Sample Alpha Summit');
    await owner.locator('input[name="slug"]').fill('sample-alpha-summit');
    await owner.getByRole('button', { name: 'Create draft event' }).click();
    await expect(owner).toHaveURL(/\/app\/sample-alpha\/events\/[0-9a-f-]{36}$/);
    const eventId = new URL(owner.url()).pathname.split('/').at(-1)!;
    const endpoint = `/api/platform/organizations/sample-alpha/events/${eventId}`;
    const alphaState = await (await alpha.request.get(`${origin}${endpoint}`)).json();
    const publicPath = '/e/sample-alpha/sample-alpha-summit';
    const visitor = await newContext(); const guide = await visitor.newPage();
    await guide.goto(publicPath);
    await expect(guide.getByRole('heading', { name: 'Sample Alpha Summit', exact: true })).toHaveCount(0);
    expect((await visitor.request.get(`${origin}${endpoint}`)).status()).toBe(401);
    expect((await visitor.request.get(`${origin}${endpoint}/setup`)).status()).toBe(401);

    await expect(owner.getByRole('heading', { name: 'Your event setup guide' })).toBeVisible();
    await expect(owner.getByRole('progressbar', { name: 'Event setup progress' })).toHaveAttribute('value', '0');
    await owner.getByRole('button', { name: 'Review & publish' }).click();
    await expect(owner.getByRole('button', { name: 'Publish event', exact: true })).toBeDisabled();
    await section(owner, 'Event details');
    await owner.getByLabel('First event date').fill('2027-04-02');
    await owner.getByLabel('Last event date').fill('2027-04-02');
    await owner.getByLabel('Tagline', { exact: true }).fill('A sample event built by its own organizer.');
    await owner.getByRole('button', { name: 'Save event details' }).click();
    await expect(owner.getByText('Your changes are saved.', { exact: true })).toBeVisible();
    await section(owner, 'Event days');
    await owner.getByRole('button', { name: 'Add event day', exact: true }).click();
    await owner.getByLabel('Day label').fill('Friday');
    await owner.getByLabel('Event date', { exact: true }).fill('2027-04-02');
    await saveRecord(owner);
    await section(owner, 'Speakers');
    await owner.getByRole('button', { name: 'Add speaker', exact: true }).click();
    await owner.getByLabel('Speaker name').fill('Sample Speaker');
    await owner.getByLabel('Biography').fill('Synthetic speaker for platform qualification.');
    await owner.getByLabel('This is sample content').check();
    await saveRecord(owner);
    await section(owner, 'Sponsors');
    await owner.getByRole('button', { name: 'Add sponsor', exact: true }).click();
    await owner.getByLabel('Sponsor name').fill('Sample Sponsor');
    await owner.getByLabel('This is sample content').check();
    await saveRecord(owner);
    await section(owner, 'Agenda');
    await owner.getByRole('button', { name: 'Add session', exact: true }).click();
    const available = await (await alpha.request.get(`${origin}${endpoint}/lookups`)).json();
    expect(available.agenda_days).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Friday' })]));
    await owner.getByLabel('Event day', { exact: true }).selectOption({ label: 'Friday' });
    await owner.getByLabel('Session title').fill('Sample opening keynote');
    await owner.getByLabel(/^Starts at/).fill('2027-04-02T09:00');
    await owner.getByLabel(/^Ends at/).fill('2027-04-02T10:00');
    await owner.getByRole('group', { name: 'Speakers for this session' }).getByLabel('Sample Speaker').check();
    await owner.getByLabel('This is sample content').check();
    await saveRecord(owner);

    // A published session cannot appear while its parent day is still a draft.
    await section(owner, 'Event days');
    await owner.getByRole('button', { name: 'Edit', exact: true }).click();
    await owner.getByLabel('Published in the attendee guide', { exact: true }).uncheck();
    await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(owner.locator('form.platform-editor')).toHaveCount(0);
    await section(owner, 'Setup guide');
    await expect(owner.getByText(/1 marked Published session is hidden/)).toBeVisible();
    const setupResponse = await alpha.request.get(`${origin}${endpoint}/setup`);
    expect(setupResponse.headers()['cache-control']).toContain('no-store');
    expect(await setupResponse.json()).toMatchObject({ eventId, canPublish: true, sessionsOnHiddenDays: 1 });
    await owner.reload();
    await expect(owner.getByText(/1 marked Published session is hidden/)).toBeVisible();
    await owner.screenshot({ path: info.outputPath('setup-desktop.png'), fullPage: true });
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.screenshot({ path: info.outputPath('setup-mobile.png'), fullPage: true });
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await owner.locator('.setup-check').filter({ has: owner.getByRole('heading', { name: 'Event days', exact: true }) }).getByRole('button').click();
    await owner.getByRole('button', { name: 'Edit', exact: true }).click();
    await saveRecord(owner);
    await section(owner, 'Setup guide');
    await expect(owner.getByText('1 session included in the guide.', { exact: true })).toBeVisible();
    await expect(owner.getByText(/marked Published session is hidden/)).toHaveCount(0);
    await owner.reload();
    await section(owner, 'Agenda');
    await expect(owner.getByRole('heading', { name: 'Sample opening keynote', exact: true })).toBeVisible();
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.screenshot({ path: info.outputPath('customer-mobile.png'), fullPage: true });
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await section(owner, 'Preview & publish');
    const preview = await alpha.newPage();
    await preview.goto(`/app/sample-alpha/events/${eventId}/preview`);
    await expect(preview.getByRole('heading', { name: 'Sample Alpha Summit', exact: true })).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Sample opening keynote', exact: true })).toBeVisible();
    await preview.close();
    await owner.getByRole('button', { name: 'Publish event', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Your event guide is live.' })).toBeVisible();
    await guide.goto(publicPath);
    await expect(guide.getByRole('heading', { name: 'Sample Alpha Summit', exact: true })).toBeVisible();
    await expect(guide.getByRole('heading', { name: 'Sample opening keynote', exact: true })).toBeVisible();
    await expect(guide.getByRole('heading', { name: 'Sample Sponsor', exact: true })).toBeVisible();
    await guide.setViewportSize({ width: 390, height: 844 });
    await guide.screenshot({ path: info.outputPath('public-event-mobile.png'), fullPage: true });
    expect(await guide.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    const beta = await newContext(); const betaPage = await beta.newPage();
    await signIn(betaPage, 'beta');
    await betaPage.getByRole('button', { name: 'Accept invitation' }).click();
    await betaPage.locator('a.platform-workspace-link').filter({ hasText: 'Sample Beta Events' }).click();
    expect((await beta.request.get(`${origin}/api/platform/agency`)).status()).toBe(403);
    expect((await beta.request.get(`${origin}${endpoint}`)).status()).toBe(404);
    expect((await beta.request.get(`${origin}${endpoint}/setup`)).status()).toBe(404);
    expect((await write(beta, endpoint, { version: 0, values: {} }, 'PATCH')).status()).toBe(404);
    expect((await beta.request.get(`${origin}/api/platform/organizations/sample-beta/events/${eventId}`)).status()).toBe(404);
    const betaValues = { slug: 'sample-beta-summit', name: 'Sample Beta Summit', tagline: '', timezone: 'America/Chicago', start_date: '2027-04-03', end_date: '2027-04-03', brand_logo_url: '' };
    const betaCreate = await write(beta, '/api/platform/organizations/sample-beta/events', { request_id: randomUUID(), values: betaValues });
    expect(betaCreate.status()).toBe(201);
    const betaEvent = await betaCreate.json();
    expect((await write(beta, `/api/platform/organizations/sample-beta/events/${betaEvent.id}/publish`, { version: 0, published: true })).status()).toBe(200);
    await guide.goto('/e/sample-beta/sample-beta-summit');
    await expect(guide.getByRole('heading', { name: 'Sample Beta Summit', exact: true })).toBeVisible();
    await expect(guide.getByText('Sample opening keynote', { exact: true })).toHaveCount(0);
    await guide.goto(publicPath);
    await expect(guide.getByRole('heading', { name: 'Sample Alpha Summit', exact: true })).toBeVisible();
    const stale = await write(alpha, `${endpoint}/publish`, { version: 0, published: false });
    expect(stale.status()).toBe(409);
    const privateResponse = await alpha.request.get(`${origin}${endpoint}`);
    expect(privateResponse.headers()['cache-control']).toContain('no-store');
    const csrf = await alpha.request.post(`${origin}${endpoint}/publish`, { headers: { Origin: 'https://wrong.example.test' }, data: { version: 2, published: false } });
    expect(csrf.status()).toBe(403);

    const org = alphaState.organization;
    expect((await write(agency, '/api/platform/organizations/sample-alpha', { name: org.name, version: org.version, status: 'suspended' }, 'PATCH')).status()).toBe(200);
    expect((await alpha.request.get(`${origin}${endpoint}`)).status()).toBe(403);
    expect((await agency.request.get(`${origin}${endpoint}`)).status()).toBe(200);
    expect((await write(agency, '/api/platform/organizations/sample-alpha', { name: org.name, version: org.version + 1, status: 'active' }, 'PATCH')).status()).toBe(200);
    await owner.getByRole('button', { name: 'Unpublish event', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Ready to share your event?' })).toBeVisible();
    await guide.reload();
    await expect(guide.getByRole('heading', { name: 'Sample Alpha Summit', exact: true })).toHaveCount(0);
    await owner.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(owner).toHaveURL(`${origin}/platform/auth`);
    expect((await alpha.request.get(`${origin}${endpoint}`)).status()).toBe(401);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
