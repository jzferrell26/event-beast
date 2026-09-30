import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';

// Mocked network fixtures must not be bypassed by a controlling service worker.
// The real offline transport is exercised separately in public-offline.spec.ts.
test.use({ serviceWorkers: 'block' });

test('public essentials stay open while community navigation is discoverable without notifications', async ({ page }, info) => {
  const privateRequests: string[] = []; const errors: string[] = [];
  page.on('request', request => { if (/\/api\/(saved|people|inbox|profile)(\?|\/|$)/.test(request.url())) privateRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/agenda', '/more/speakers', '/sponsors', '/more', '/more/lunch', '/more/venue', '/more/help']) {
    await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('navigation', { name: info.project.name === 'public-desktop' ? 'Main navigation' : 'Mobile navigation', exact: true });
    await expect(nav.getByRole('link')).toHaveText(info.project.name === 'public-desktop' ? ['Home','Agenda','Feed','People','Inbox','Speakers','Sponsors','More'] : ['Home','Agenda','Feed','Inbox','Sponsors','More']);
    expect(await page.locator('a[href="/more/notifications"]').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(privateRequests).toEqual([]); expect(errors).toEqual([]);
  await page.goto('/'); await page.screenshot({ path: info.outputPath('public-home.png'), fullPage: true });
});

test('anonymous session bookmarks persist across reload without an account', async ({ page }) => {
  await page.goto(`/agenda/${demoGuide.sessions[0].id}`);
  await page.getByRole('button', { name: 'Save this session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to your agenda', exact: true })).toBeVisible();
  await page.goto('/more/saved'); await expect(page.locator('.session-title')).toHaveCount(1);
  await page.reload(); await expect(page.locator('.session-title')).toHaveCount(1);
  await expect(page.getByText('Saved on this device only.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: `Unsave ${demoGuide.sessions[0].title}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for your favorites.' })).toBeVisible();
  await expect(page).toHaveURL(/\/more\/saved$/);
});

test('sponsor workspace remains separate and community routes expose only labeled demo data', async ({ request }) => {
  for (const path of ['/sponsor', '/more/sponsors/old-id']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307); expect(response.headers().location).toMatch(/\/(sponsors)?$/);
  }
  for (const path of ['/api/sponsor', '/api/sponsors/old-id/representatives']) {
    const response = await request.get(path); expect(response.status()).toBe(410); expect(response.headers()['cache-control']).toContain('no-store');
  }
  const people = await request.get('/api/people'); expect(people.status()).toBe(200); expect(people.headers()['cache-control']).toContain('no-store');
  const feed = await request.get('/api/feed'); expect(await feed.json()).toMatchObject({ posts: [], demo: true });
});

test('sponsors are logo-and-tier only and the speaker source link is removed', async ({ page }, info) => {
  await page.goto('/sponsors');
  await expect(page.locator('.public-sponsor-logo-card')).toHaveCount(demoGuide.sponsors.length);
  for (const link of await page.locator('.public-sponsor-logo-card a').all()) expect(await link.getAttribute('href')).toMatch(/^https:\/\//);
  for (const sponsor of demoGuide.sponsors) if (sponsor.booth) await expect(page.getByText(sponsor.booth, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('public-sponsors.png'), fullPage: true });
  await page.goto(`/more/speakers/${demoGuide.speakers[0].id}`);
  await expect(page.getByRole('link', { name: 'Official speaker information' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: demoGuide.speakers[0].full_name, exact: true })).toBeVisible();
});

test('square and banner ads fit without cropping and do not leak into other pages', async ({ page }, info) => {
  const guide = publicSiteGuide(structuredClone(demoGuide), true);
  guide.placements = [
    { ...demoGuide.placements[0], id: 'public-banner', day_id: null, after_session_id: null, surface: 'home', image_url: 'https://assets.example/banner.png', image_alt: 'Approved sponsor banner', image_format: 'banner', published: true, link_url: 'https://partner.example/' },
    { ...demoGuide.placements[0], id: 'public-square', day_id: null, after_session_id: null, surface: 'sponsors', image_url: 'https://assets.example/square.png', image_alt: 'Approved square advertisement', image_format: 'square', published: true },
  ];
  await page.route('https://assets.example/**', route => route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' }));
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  for (const [path, alt, format] of [['/', 'Approved sponsor banner', 'banner'], ['/sponsors', 'Approved square advertisement', 'square']]) {
    await page.goto(path);
    await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); return page.getByAltText(alt).count(); }).toBe(1);
    const image = page.getByAltText(alt); await expect(image).toBeVisible();
    expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
    await page.locator(`.sponsor-creative-${format}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`sponsor-ad-${format}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.goto('/agenda'); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByAltText('Approved square advertisement')).toHaveCount(0);
});

test('organizer auth stays separate and public screens pass accessibility', async ({ page }) => {
  await page.goto('/auth?next=/admin'); await expect(page.getByRole('heading', { name: 'Organizer sign in.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create an account', exact: true })).toHaveCount(0);
  for (const path of ['/', '/sponsors', '/more/help']) {
    await page.goto(path); await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([]);
  }
});
