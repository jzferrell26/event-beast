import { expect, test } from '@playwright/test';
import { verifyWebKitOfflineOrigin } from './helpers/offline-origin';
import { demoGuide } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';

test('account-free essentials survive offline without private data in the cache', async ({ page, context, browser, browserName }) => {
  if (browserName === 'webkit') {
    // Exercise the real worker against a stopped isolated origin, not WebKit's
    // broken setOffline flag (which also blocks cache-only responses).
    await verifyWebKitOfflineOrigin(page, browser, publicSiteGuide(demoGuide, true));
  } else {
  await page.goto('/');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'REFRESH_PUBLIC_GUIDE' });
  });
  await expect.poll(async () => page.evaluate(async () => {
    const cached = await (await caches.open('event-beast-public-v1')).match('/api/guide');
    return cached ? (await cached.json()).publicSite : false;
  })).toBe(true);
  const cachedPaths = await page.evaluate(async () => (await (await caches.open('event-beast-public-v1')).keys()).map(request => new URL(request.url).pathname));
  expect(cachedPaths).toContain('/api/guide');
  expect(cachedPaths.filter(path => /^\/(admin|auth|api\/(me|saved|inbox|people|profile))/.test(path))).toEqual([]);
  await page.goto('/offline.html');
  await expect(page.getByText(/Guide saved/)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline · Guide saved/)).toBeVisible();
  }
  await expect(page.locator('#guide-content article')).not.toHaveCount(0);
  await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
  await expect(page.locator('#guide-content')).toContainText('Cuantico AI');
  await expect(page.locator('#guide-content .location')).toHaveCount(0);
  for (const section of ['Lunch', 'Venue']) {
    await page.getByRole('tab', { name: section, exact: true }).click();
    await expect(page.locator('#guide-content')).not.toBeEmpty();
  }
  await expect(page.getByRole('tab', { name: 'Updates', exact: true })).toHaveCount(0);
  await context.setOffline(false);
});
