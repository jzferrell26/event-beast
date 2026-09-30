import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide, demoMe, demoMessages } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const thread = '70000000-0000-4000-8000-000000000101';
const avatar = 'https://assets.example/authorized-short-lived-avatar.webp';
async function fixture(page: Page) {
  const state = { unread: 0, latestId: null as string|null, authenticated: true, sends: 0 };
  const guide = { ...publicSiteGuide(structuredClone(demoGuide), true), mode: 'live' };
  await page.route('https://assets.example/**', route => route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/guide') return route.fulfill({ json: guide });
    if (path === '/api/me') return route.fulfill({ json: { ...demoMe, mode: 'live', authenticated: state.authenticated, eligible: state.authenticated, isAdmin: false, attendeeId: state.authenticated ? demoMe.attendeeId : null } });
    if (path === '/api/inbox/unread') return route.fulfill({ json: { unread: state.unread, latestId: state.latestId, conversationId: state.unread ? thread : null } });
    if (path === '/api/saved') return route.fulfill({ json: { sessions: [], attendees: [] } });
    if (path === '/api/feed') return route.fulfill({ json: { posts: [{ id: thread, author_id: 'a-peer', author_name: 'Photo test attendee', avatar_url: avatar, body: 'Visible post', created_at: '2026-10-06T18:00:00Z', version: 0, status: 'visible' }], nextCursor: null } });
    if (path === '/api/inbox/' + thread) {
      if (route.request().method() === 'PATCH') { state.unread = 0; return route.fulfill({ json: { saved: true } }); }
      if (route.request().method() === 'POST') { state.sends++; return route.fulfill({ status: 409, json: { error: 'No real test messages' } }); }
      return route.fulfill({ json: { messages: demoMessages(thread), peer: { id: 'a-peer', name: 'Photo test attendee', avatar_url: avatar }, hasMore: false, blockedByMe: false, peerReadId: 0 } });
    }
    if (path === '/api/inbox') return route.fulfill({ json: { conversations: [], hasMore: false } });
    return route.fulfill({ status: 404, json: { error: 'Unmapped synthetic endpoint' } });
  });
  return state;
}
async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); return page.locator('.demo-strip:visible').count(); }).toBe(0);
}

test('new message is visible outside Inbox, read receipts clear badges, and logout removes identity state', async ({ page }, info) => {
  const state = await fixture(page);
  const baseline = page.waitForResponse(response => new URL(response.url()).pathname === '/api/inbox/unread');
  await page.goto('/'); await settled(page);
  expect((await (await baseline).json()).unread).toBe(0);
  // Establish the initial empty inbox before injecting a new arrival. A first
  // fetch with existing unread messages must show a badge, not a "new" notice.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  await expect(page.locator('.message-shortcut')).toBeVisible();
  await expect(page.locator('.message-count:visible')).toHaveCount(0);
  state.unread = 2; state.latestId = '9007199254740995';
  await page.evaluate(() => window.dispatchEvent(new Event('event-beast:inbox-changed')));
  await expect(page.locator('.message-shortcut')).toHaveAttribute('aria-label', 'Private messages, 2 unread messages');
  await expect(page.locator('.bottom-nav:visible .message-count, .desktop-sidebar:visible .message-count')).toHaveText('2');
  await expect(page.getByRole('complementary', { name: 'New private message' })).toBeVisible();
  await expect(page.locator('a[href="/more/notifications"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('message-alert-away-from-inbox.png') });
  await page.getByRole('link', { name: 'Open conversation', exact: true }).click();
  await expect(page.locator('.thread-header:visible')).toContainText('Photo test attendee');
  await expect(page.locator('.message-count:visible')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to inbox' }).click();
  state.unread = 3; state.latestId = '9007199254741000';
  await page.evaluate(() => window.dispatchEvent(new Event('event-beast:inbox-changed')));
  await expect(page.locator('.message-shortcut')).toHaveAttribute('aria-label', 'Private messages, 3 unread messages');
  state.authenticated = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.message-count:visible')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'New private message' })).toHaveCount(0);
});

test('permitted profile photos render on the wall and the one-to-one header with no Member moderation tools', async ({ page }, info) => {
  await fixture(page);
  await page.goto('/feed'); await settled(page);
  const wallImage = page.locator('.wall-post:visible .avatar img');
  await expect(wallImage).toHaveAttribute('src', avatar);
  await expect.poll(() => wallImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('link', { name: 'Moderate wall' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('wall-photo.png') });
  await page.goto('/inbox/' + thread); await settled(page);
  const peerImage = page.locator('.thread-header:visible .avatar img');
  await expect(peerImage).toHaveAttribute('src', avatar);
  await expect.poll(() => peerImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([]);
});

test('keyboard panning cannot push the thread into blank space or inflate the document, and navigation unlocks scrolling', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    let height = 844, top = 0, scale = 1;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, { height: { get: () => height }, width: { get: () => innerWidth }, offsetTop: { get: () => top }, offsetLeft: { get: () => 0 }, scale: { get: () => scale } });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.assign(window, { setChatViewport: (h: number, t = 0, s = 1) => { height = h; top = t; scale = s; viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); } });
  });
  const state = await fixture(page);
  await page.goto('/inbox/' + thread); await settled(page);
  const draft = page.getByRole('textbox', { name: 'Your message', exact: true });
  await expect(draft).toBeEnabled();
  await draft.fill('Keep this unsent draft');
  await page.evaluate(() => { (window as unknown as { setChatViewport: (h:number,t:number)=>void }).setChatViewport(360, 300); window.scrollTo({ top: 480, behavior: 'instant' }); });
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'true');
  await expect.poll(async () => {
    const header = await page.locator('.thread-header:visible').boundingBox();
    const composer = await page.locator('.composer:visible').boundingBox();
    return Boolean(header && composer && header.y >= 300 && composer.y >= 300 && composer.y + composer.height <= 661);
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await expect(draft).toHaveValue('Keep this unsent draft'); expect(state.sends).toBe(0);
  await page.screenshot({ path: info.outputPath('keyboard-pan-geometry.png') });
  await page.evaluate(() => (window as unknown as { setChatViewport: (h:number,t:number)=>void }).setChatViewport(844, 0));
  await draft.blur();
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'false');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Momentum Builder LIVE 2026', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).not.toHaveAttribute('data-thread-viewport', 'true');
  expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY])).not.toContain('hidden');
  await expect.poll(() => page.evaluate(() => { window.scrollTo({ top: 100000, behavior: 'instant' }); return scrollY > 0; })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - (document.querySelector('.app-shell')!.getBoundingClientRect().bottom + scrollY))).toBeLessThan(2);
});
