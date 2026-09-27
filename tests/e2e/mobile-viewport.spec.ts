import { test, expect, type Page } from '@playwright/test';
import { demoGuide, demoMessages, demoProfiles } from '../../src/lib/demo';

declare global {
  interface Window {
    setQualificationViewport: (values: { height: number; top?: number; scale?: number }) => void;
  }
}

// Browser geometry injection exercises the real resize/focus listeners. It is
// not a claim to have operated a physical phone keyboard or venue network.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
async function visualViewport(page: Page) {
  await page.addInitScript(() => {
    let height: number | undefined;
    let top = 0, scale = 1;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => height ?? innerHeight }, width: { get: () => innerWidth },
      offsetTop: { get: () => top }, offsetLeft: { get: () => 0 }, scale: { get: () => scale },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.setQualificationViewport = (values) => {
      height = values.height; top = values.top ?? 0; scale = values.scale ?? 1;
      viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
    };
  });
}

test('mobile messaging keeps drafts and the composer usable through keyboard, pan, zoom and rotation', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visualViewport(page);
  const guide = structuredClone(demoGuide);
  guide.mode = 'live';
  const threadId = '70000000-0000-4000-8000-000000000101';
  let sends = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/guide') return route.fulfill({ json: guide });
    if (path === '/api/me') return route.fulfill({ json: { mode: 'live', authenticated: true, eligible: true, isAdmin: false, attendeeId: 'demo-self', profile: demoProfiles[0], preferences: { onboarding_done: true } } });
    if (path === '/api/saved') return route.fulfill({ json: { sessions: [], attendees: [] } });
    if (path === `/api/inbox/${threadId}`) {
      if (route.request().method() === 'POST') { sends++; return route.fulfill({ status: 409, json: { error: 'No real test messages are sent' } }); }
      if (route.request().method() === 'PATCH') return route.fulfill({ json: { saved: true } });
      return route.fulfill({ json: { messages: demoMessages(threadId), hasMore: false, peer: { id: demoProfiles[0].attendee_id, name: 'Synthetic messaging partner' }, blockedByMe: false, peerReadId: 2 } });
    }
    return route.fulfill({ status: 404, json: { error: 'Synthetic endpoint only' } });
  });
  await page.goto(`/inbox/${threadId}`);
  const draft = page.getByRole('textbox', { name: 'Your message', exact: true });
  await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); return draft.isEnabled(); }).toBe(true);
  await draft.fill('Draft survives');
  await draft.press('Enter'); await draft.pressSequentially('a keyboard and rotation');
  const text = 'Draft survives\na keyboard and rotation';
  await expect(draft).toHaveValue(text);
  expect(sends).toBe(0);
  await page.evaluate(() => window.setQualificationViewport({ height: 450 }));
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'true');
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await expect.poll(async () => (await page.locator('.composer').boundingBox())!.y + (await page.locator('.composer').boundingBox())!.height).toBeLessThanOrEqual(451);
  await expect(page.locator('.thread-messages')).toBeVisible();
  // Losing the connection may dismiss a native keyboard when the input is
  // disabled. Preserve the draft and usable geometry either way, then recover.
  await context.setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();
  await expect(draft).toBeDisabled();
  await expect(draft).toHaveValue(text);
  await context.setOffline(false);
  await expect(page.locator('.offline-banner')).toHaveCount(0);
  await expect(draft).toBeEnabled();
  await draft.focus();
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'true');
  await page.evaluate(() => window.setQualificationViewport({ height: 450, top: 35 }));
  await expect.poll(async () => {
    const rect = (await page.locator('.composer').boundingBox())!; return rect.y + rect.height;
  }).toBeLessThanOrEqual(486);
  await expect(draft).toHaveValue(text);
  await page.evaluate(() => window.setQualificationViewport({ height: 422, scale: 2 }));
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'false');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.setQualificationViewport({ height: 390 }));
  await expect(draft).toHaveValue(text);
  await expect.poll(async () => {
    const composer = (await page.locator('.composer').boundingBox())!;
    const nav = (await page.locator('.bottom-nav').boundingBox())!;
    return composer.y + composer.height <= nav.y + 1;
  }).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.setQualificationViewport({ height: 844 }));
  await expect(draft).toHaveValue(text);
  await expect(page.locator('body')).toHaveAttribute('data-keyboard', 'false');
  await page.screenshot({ path: test.info().outputPath('phone-thread.png') });
});

test('offline and notch space are included in the sticky header and agenda controls', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agenda');
  await page.locator('.session-card').first().waitFor();
  // Inject a measured extra inset to exercise actual ResizeObserver geometry.
  await page.addStyleTag({ content: '.app-shell .topbar{height:110px;padding-top:34px}' });
  await expect.poll(() => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--app-header-offset')))).toBe(110);
  await context.setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();
  await expect.poll(async () => {
    const header = (await page.locator('.topbar').boundingBox())!;
    const banner = (await page.locator('.offline-banner').boundingBox())!;
    return header.y >= banner.y + banner.height - 1;
  }).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(async () => {
    const header = (await page.locator('.topbar').boundingBox())!;
    const controls = (await page.locator('.agenda-controls').boundingBox())!;
    return controls.y >= header.y + header.height - 1;
  }).toBe(true);
  await context.setOffline(false);
  await expect(page.locator('.offline-banner')).toHaveCount(0);
});

test('an editable modal remains inside a reduced visual viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visualViewport(page);
  await page.goto(`/inbox/70000000-0000-4000-8000-000000000101`);
  await page.getByRole('button', { name: 'Conversation options' }).click();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('textbox').first();
  await input.fill('Synthetic report, never submitted.');
  await page.evaluate(() => window.setQualificationViewport({ height: 430, top: 25 }));
  await expect.poll(async () => {
    const rect = (await dialog.boundingBox())!;
    return rect.y >= 25 && rect.y + rect.height <= 455;
  }).toBe(true);
  await expect(input).toHaveValue('Synthetic report, never submitted.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
