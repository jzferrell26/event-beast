import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide } from '../../src/lib/demo';

// Public fixtures only; real cache behavior is covered by the offline suite.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const start = new Date('2026-10-08T14:15:00Z');
const routes = ['/', '/agenda', '/people', '/inbox', '/more/speakers', '/more/venue', '/more/lunch', '/more/help', '/more/profile', '/join'];
async function refreshUntil(page: Page, check: () => Promise<boolean>) {
  await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); return check(); }).toBe(true);
}

for (const width of [320, 375, 390, 430, 768]) {
  test(`phone-first screens reflow and retain usable controls at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
    await page.clock.setFixedTime(start);
    for (const route of routes) {
      await page.goto(route);
      await page.locator('h1:visible').first().waitFor();
      await expect(page.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
      if (route !== '/join') {
        await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(17, 17, 19)');
        await expect(page.getByRole('link', { name: 'Event announcements' })).toHaveCSS('color', 'rgb(247, 247, 250)');
        await expect(page.locator('.bottom-nav a')).toHaveCount(5);
        const sizes = await page.locator('.topbar .icon-button,.topbar .profile-shortcut,.bottom-nav>a,.main-content .button:visible,.main-content .icon-button:visible,.interest-filters>button:visible').evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect(); return { name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 35), width: rect.width, height: rect.height };
        }));
        expect(sizes.filter(size => size.width < 43.9 || size.height < 43.9), route).toEqual([]);
      }
      const inputSizes = await page.locator('input:not([type="checkbox"]):not([type="file"]):visible,textarea:visible,select:visible').evaluateAll(elements => elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize)));
      expect(inputSizes.every(size => size >= 16), `${route}: input font size`).toBe(true);
      if (route === '/') {
        const hero = (await page.locator('.home-hero').boundingBox())!;
        expect(hero.height).toBeLessThan(300);
        const glance = (await page.locator('.mobile-next-session').boundingBox())!;
        const nav = (await page.locator('.bottom-nav').boundingBox())!;
        expect(glance.y + glance.height).toBeLessThanOrEqual(nav.y);
        await expect(page.locator('.mobile-next-session')).toContainText('Happening now');
        await expect(page.locator('.home-grid')).toBeHidden();
        await page.screenshot({ path: test.info().outputPath(`home-${width}.png`) });
      }
    }
    await page.goto('/agenda');
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  });
}

test('mobile-only additions are not visible or focusable on approved desktop layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ['/', '/agenda', '/more/venue']) {
    await page.goto(route);
    await expect(page.locator('.mobile-only:visible')).toHaveCount(0);
    await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.95)');
    await expect(page.locator('.desktop-sidebar')).toBeVisible();
  }
});

test('urgent updates precede the welcome and the moment never promotes held sessions', async ({ page }) => {
  const guide = structuredClone(demoGuide);
  guide.announcements = [{ ...guide.announcements[0], title: 'Important room update', severity: 'urgent', body: 'Please check the latest published room information.' }];
  guide.sessions[0].published = false;
  guide.sessions[1].title = 'The next confirmed session';
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(start);
  await page.goto('/');
  // A guide refresh can briefly retain the previous render's DOM. Wait for
  // exactly one visible, updated summary rather than throwing on that overlap.
  const moment = page.locator('.mobile-next-session:visible');
  await refreshUntil(page, () => moment.allTextContents().then(texts => texts.length === 1 && texts[0].includes('The next confirmed session')));
  await expect(moment).toHaveCount(1);
  await expect(moment).toContainText('Coming up');
  const alert = (await page.locator('.mobile-event-alerts').boundingBox())!;
  const hero = (await page.locator('.home-hero').boundingBox())!;
  expect(alert.y + alert.height).toBeLessThanOrEqual(hero.y);
  await expect(page.getByText('Important room update', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(moment).not.toContainText(guide.sessions[0].title);
});

test('agenda jump, day-key navigation and bookmark hit areas cooperate with sticky controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-10-08T16:45:00Z'));
  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Jump to now', exact: true }).click();
  const anchor = page.locator(`#agenda-session-${demoGuide.sessions[3].id}`);
  await expect(anchor).toBeFocused();
  await expect.poll(async () => {
    const controls = (await page.locator('.agenda-controls').boundingBox())!;
    const card = (await anchor.boundingBox())!;
    return card.y >= controls.y + controls.height - 1;
  }).toBe(true);
  const save = anchor.getByRole('button', { name: `Save ${demoGuide.sessions[3].title}`, exact: true });
  await save.click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(anchor.getByRole('button', { name: `Unsave ${demoGuide.sessions[3].title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const first = page.getByRole('tab', { name: /Day 01/ });
  await first.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Day 02/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('no-such-session');
  await expect(page.getByRole('button', { name: 'First session', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.agenda-list .session-card')).toHaveCount(1);
  // The stretched title-link intentionally receives taps outside its text.
  // Send a real coordinate tap and verify hit testing rather than forcing a
  // click through Playwright's (correct) sibling-interception protection.
  const location = page.locator('.agenda-list .session-location');
  await location.scrollIntoViewIfNeeded();
  const box = (await location.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'), point)).toBe(`/agenda/${demoGuide.sessions[3].id}`);
  await page.mouse.click(point.x, point.y);
  await expect(page).toHaveURL(new RegExp(`/agenda/${demoGuide.sessions[3].id}$`));
});

test('long session, speaker and venue labels reflow without truncating biography text', async ({ page }) => {
  const guide = structuredClone(demoGuide);
  const long = 'ExtraordinarilyLongUnbrokenSpeakerCompanyAndLocationName'.repeat(3);
  guide.sessions[0].title = long; guide.sessions[0].room = long;
  guide.speakers[0] = { ...guide.speakers[0], full_name: long, bio: `${long} Last complete sentence.`, headshot_url: '/speakers/robert-clark.webp' };
  guide.venues[0] = { ...guide.venues[0], title: long, location: long, is_demo: false };
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.clock.setFixedTime(start);
  for (const route of ['/agenda', '/more/speakers', '/more/venue']) {
    await page.goto(route);
    await refreshUntil(page, () => page.locator('#main').innerText().then(text => text.includes(long)));
    const reflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(reflow.viewport, `${route}: mobile layout must not zoom out to disguise overflow`).toBeLessThanOrEqual(321);
    expect(reflow.document, route).toBeLessThanOrEqual(321);
  }
});

test('published venue address copy succeeds or offers honest fallback without changing data', async ({ page }) => {
  const guide = structuredClone(demoGuide);
  guide.venues = [{ ...guide.venues[0], title: 'Synthetic venue', location: '123 Example Avenue', is_demo: false, directions_url: 'https://example.test/directions' }];
  await page.route('**/api/guide', route => route.fulfill({ json: guide }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more/venue');
  await refreshUntil(page, () => page.getByRole('button', { name: 'Copy address for Synthetic venue' }).count().then(count => count === 1));
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copiedTest = text; } } }));
  await page.getByRole('button', { name: 'Copy address for Synthetic venue' }).click();
  await expect(page.getByText('Venue address copied.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.copiedTest)).toBe('123 Example Avenue');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard permission denied'); } } }));
  await page.getByRole('button', { name: 'Copy address for Synthetic venue' }).click();
  await expect(page.locator('.toast[role="alert"]')).toContainText('Copy is unavailable');
  await expect(page.getByRole('link', { name: 'Get directions', exact: false })).toHaveAttribute('href', guide.venues[0].directions_url);
});
