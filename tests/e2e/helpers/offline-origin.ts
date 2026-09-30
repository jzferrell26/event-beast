import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { expect, type Browser, type Page } from '@playwright/test';
import { demoGuide } from '../../../src/lib/demo';
import type { Guide } from '../../../src/lib/types';

/** WebKit's setOffline flag currently kills even cache-only worker responses:
 * https://github.com/microsoft/playwright/issues/42775
 * Stop an isolated origin instead. Use the actual shipped worker, reader and
 * assets, never mocked fetch/cache responses or a production server shutdown. */
export async function verifyWebKitOfflineOrigin(page: Page, browser: Browser, guide: Guide = demoGuide): Promise<void> {
  const files = new Map([
    ['/sw.js', 'application/javascript'], ['/offline.js', 'application/javascript'],
    ['/offline.html', 'text/html'], ['/offline-base.css', 'text/css'],
    ['/branding/momentum-builder-live-2026.png', 'image/png'],
    ['/icons/icon-192.png', 'image/png'], ['/icons/icon-512.png', 'image/png'],
    ['/icons/apple-touch-icon.png', 'image/png'],
  ].map(([path, type]) => [path, { type, bytes: readFileSync(new URL(`../../../public${path}`, import.meta.url)) }]));
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Isolated public offline qualification</title><script>navigator.serviceWorker.register("/sw.js")</script>');
    } else if (path === '/api/guide') {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('X-Event-Beast-Public', 'guide-v1');
      response.end(JSON.stringify(guide));
    } else if (files.has(path)) {
      const file = files.get(path)!;
      response.setHeader('Content-Type', file.type); response.end(file.bytes);
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Isolated test server address unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  };
  try {
    await page.goto(origin);
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; registration.active?.postMessage({ type: 'REFRESH_PUBLIC_GUIDE' }); });
    await expect.poll(() => page.evaluate(async () => Boolean(navigator.serviceWorker.controller && await (await caches.open('event-beast-public-v1')).match('/api/guide')))).toBe(true);
    await stop();
    await page.goto(`${origin}/offline.html`);
    const logo = page.getByRole('img', { name: 'Momentum Builder LIVE 2026', exact: true });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1000)).toBe(true);
    await expect(page.locator('#guide-content article').first()).toBeVisible();
    const keys = await page.evaluate(async () => (await (await caches.open('event-beast-public-v1')).keys()).map(request => new URL(request.url).pathname));
    expect(keys).toContain('/branding/momentum-builder-live-2026.png');
    expect(keys.some(path => /^\/(admin|inbox|people|auth)(\/|$)/.test(path))).toBe(false);
    // A fresh browser has no worker/cache and cannot load the stopped origin.
    const fresh = await browser.newContext({ serviceWorkers: 'block' });
    try { await expect((await fresh.newPage()).goto(`${origin}/offline.html`, { timeout: 3000 })).rejects.toThrow(); }
    finally { await fresh.close(); }
  } finally { await stop(); }
}
