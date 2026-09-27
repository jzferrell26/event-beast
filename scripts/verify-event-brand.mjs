import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Read-only production check: no account creation, invitations or database writes.
const brand = JSON.parse(readFileSync('data/event-brand.json', 'utf8'));
const origin = new URL(process.env.EVENT_BEAST_VERIFY_ORIGIN || 'https://event-beast.vercel.app').origin;
const revision = process.env.EVENT_BEAST_EXPECTED_REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
const output = 'test-results/brand-release';
mkdirSync(output, { recursive: true });
const checks = [];
const browser = await chromium.launch();
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['narrow-phone', { width: 320, height: 740 }]]) {
    const context = await browser.newContext({ viewport });
    try {
      const response = await context.request.get(`${origin}/api/release`);
      expect(response.status()).toBe(200);
      const release = await response.json();
      expect(release.revision).toBe(revision);
      expect(release.mode).toBe('live');
      const asset = await context.request.get(origin + brand.asset_path);
      expect(asset.status()).toBe(200);
      expect(asset.headers()['content-type']).toContain('image/png');
      expect(createHash('sha256').update(await asset.body()).digest('hex')).toBe(brand.sha256);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/', '/inbox', '/join', '/auth']) {
        await page.goto(origin + route, { waitUntil: 'networkidle' });
        const logo = page.locator('a.brand-official:visible img.brand-logo');
        await expect(logo).toHaveCount(1);
        await expect(logo).toBeVisible();
        await expect(logo).toHaveAttribute('src', brand.asset_path);
        await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth === 1000 && img.naturalHeight === 359)).toBe(true);
        await expect(logo).toHaveCSS('object-fit', 'contain');
        await expect(logo).toHaveCSS('filter', 'none');
        const bounds = await logo.boundingBox();
        expect(bounds.width / bounds.height).toBeCloseTo(brand.width / brand.height, 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await expect(page.locator('.brand-mark,.brand-type')).toHaveCount(0);
        const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(scan.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), `${device} ${route}`).toEqual([]);
        await page.screenshot({ path: `${output}/${device}-${route === '/' ? 'home' : route.slice(1)}.png` });
        checks.push({ device, route, originalImageVerified: true, accessibilityViolations: 0 });
      }
      // The service worker may cache only the original public logo and existing
      // public guide assets. Private pages still remain network-only.
      await page.goto(origin + '/');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(async path => Boolean(await (await caches.open('event-beast-public-v1')).match(path)), brand.asset_path)).toBe(true);
      await page.goto(origin + '/offline.html');
      await context.setOffline(true);
      await page.reload();
      const offlineLogo = page.getByRole('img', { name: 'Momentum Builder LIVE 2026', exact: true });
      await expect(offlineLogo).toBeVisible();
      await expect.poll(() => offlineLogo.evaluate(img => img.complete && img.naturalWidth === 1000)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      checks.push({ device, route: '/offline.html', originalImageVerified: true, offline: true });
      await context.setOffline(false);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
  const report = { checkedAt: new Date().toISOString(), revision, origin, source: brand.source_url, sha256: brand.sha256, passed: true, checks };
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, revision, exactOriginalLogo: true, checkedViews: checks.length, screenshots: output }));
} catch (error) {
  writeFileSync(`${output}/failure.log`, String(error.stack || error));
  console.error(JSON.stringify({ passed: false, completedChecks: checks.length, details: `${output}/failure.log` }));
  process.exitCode = 1;
} finally { await browser.close(); }
