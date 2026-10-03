import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide } from '../../src/lib/demo';

// These tests substitute changing public-guide fixtures. Keep service-worker
// caching out of the fixture transport; the offline suite tests it separately.
test.use({ serviceWorkers: 'block' });

function fixture() {
  const guide = structuredClone(demoGuide);
  guide.speakers[0] = { ...guide.speakers[0], full_name: 'Portrait Test Speaker', title: '',
    bio: 'An extended speaker biography about leadership, financial education, and practical business strategy. This final sentence must remain visible on the card and on the detail page.',
    headshot_url: '/speakers/robert-clark.webp', source_url: 'https://www.momentumbuilderevent.com/' };
  return guide;
}

async function refresh(page: Page) {
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    return page.getByRole('heading', { name: 'Portrait Test Speaker', exact: true }).count();
  }).toBe(1);
}

test('speaker cards fill a consistent portrait frame and preserve the published biography', async ({ page }) => {
  const guide = fixture();
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.goto('/more/speakers');
  await refresh(page);
  const card = page.getByRole('link', { name: 'View speaker profile for Portrait Test Speaker', exact: true });
  const img = card.getByRole('img', { name: 'Portrait Test Speaker portrait' });
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(img).toHaveCSS('object-fit', 'cover');
  await expect(img).toHaveCSS('border-radius', '0px');
  const bounds = await img.boundingBox();
  // Phone cards deliberately use a smaller editorial canvas; desktop keeps
  // its approved large portrait. Neither device may crop the source image.
  if (page.viewportSize()!.width <= 900) {
    expect(bounds!.width).toBeGreaterThanOrEqual(80);
    expect(bounds!.width).toBeLessThanOrEqual(112);
  } else expect(bounds?.width).toBeGreaterThan(200);
  expect(bounds!.height).toBeGreaterThan(bounds!.width);
  expect(bounds!.height).toBeCloseTo(bounds!.width * 5 / 4, 0);
  await expect(card.locator('.speaker-card-bio')).toHaveText(guide.speakers[0].bio);
  expect(await card.locator('.speaker-card-bio').evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.getByRole('textbox', { name: 'Search speakers' }).fill('financial education');
  await expect(page.locator('.speaker-directory-card')).toHaveCount(1);
  await expect(card.locator('.speaker-card-bio')).toHaveCSS('font-size', '14px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('speaker-directory.png'), fullPage: true });
});

test('speaker detail keeps portrait, full biography, source and session links', async ({ page }) => {
  const guide = fixture();
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.goto(`/more/speakers/${guide.speakers[0].id}`);
  await refresh(page);
  const hero = page.locator('.speaker-profile-hero:visible');
  const img = hero.getByRole('img', { name: 'Portrait Test Speaker portrait' });
  await expect(img).toHaveCSS('object-fit', 'contain');
  await expect(hero.locator('.speaker-biography p')).toHaveText(guide.speakers[0].bio);
  await expect(hero.getByRole('link', { name: 'Official speaker information' })).toHaveAttribute('href', guide.speakers[0].source_url!);
  const linked = guide.sessionSpeakers.filter(row => row.speaker_id === guide.speakers[0].id);
  await expect(page.locator('.agenda-list:visible .session-card')).toHaveCount(linked.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('speaker-detail.png'), fullPage: true });
});

test('a failed speaker image falls back without collapsing, and a replacement recovers', async ({ page }) => {
  let guide = fixture();
  guide.speakers[0].headshot_url = '/speakers/missing-portrait.webp';
  await page.route('**/speakers/missing-portrait.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.goto('/more/speakers');
  await refresh(page);
  const card = page.getByRole('link', { name: 'View speaker profile for Portrait Test Speaker', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img', { name: 'Portrait unavailable for Portrait Test Speaker' })).toBeVisible();
  const before = await card.locator('.speaker-portrait').boundingBox();
  guide = fixture();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card.getByRole('img', { name: 'Portrait Test Speaker portrait', exact: true })).toBeVisible();
  const after = await card.locator('.speaker-portrait').boundingBox();
  expect(after?.height).toBeCloseTo(before!.height, 0);
});

test('agenda session speaker previews keep their compact layout and uncropped portraits', async ({ page }) => {
  const guide = fixture();
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.goto(`/agenda/${guide.sessions[0].id}`);
  await refresh(page);
  const card = page.locator('.session-speaker-card:visible');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveCSS('flex-direction', 'row');
  await expect(card.locator('img')).toHaveCSS('object-fit', 'contain');
  await expect(card.locator('.session-speaker-copy p')).toHaveText(guide.speakers[0].bio);
  const portrait = await card.locator('.speaker-portrait').boundingBox();
  expect(portrait!.width).toBeLessThanOrEqual(112);
  expect(portrait!.height).toBeCloseTo(portrait!.width * 5 / 4, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
