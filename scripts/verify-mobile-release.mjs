import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Read-only. This deliberately does not create accounts, send messages/mail,
// change launch settings or use private production data for screenshots.
const origin = new URL(process.env.EVENT_BEAST_VERIFY_ORIGIN || 'https://eventapp.momentumbuilder.com').origin;
if (!origin.startsWith('https://')) throw new Error('Use the deployed HTTPS website.');
const revision = process.env.EVENT_BEAST_EXPECTED_REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error('Expected revision must be a complete commit hash.');
const brand = JSON.parse(readFileSync('data/event-brand.json', 'utf8'));
const output = 'test-results/mobile-release';
mkdirSync(output, { recursive: true });
const engines = process.env.EVENT_BEAST_VERIFY_WEBKIT === 'true' ? [chromium, webkit] : [chromium];
const checks = [];
const knownDesktopFindings = [];
const report = { checkedAt: new Date().toISOString(), revision, origin, passed: false, physicalDevicesTested: false, privateProductionDataUsed: false, desktopAccessibilityCertified: false, knownDesktopFindings, checks };
try {
  for (const engine of engines) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 375, 390, 430, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        try {
          const releaseResponse = await context.request.get(`${origin}/api/release`);
          expect(releaseResponse.status()).toBe(200);
          const release = await releaseResponse.json();
          expect(release.revision).toBe(revision); expect(release.mode).toBe('live');
          expect(release.emailSignupOpen, 'Mobile styling must not open signup').toBe(false);
          const asset = await context.request.get(origin + brand.asset_path);
          expect(createHash('sha256').update(await asset.body()).digest('hex')).toBe(brand.sha256);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          for (const route of ['/', '/agenda', '/more/speakers', '/more/venue', '/more/lunch', '/more/help', '/inbox', '/join']) {
            await page.goto(origin + route, { waitUntil: 'networkidle' });
            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator('.demo-strip')).toHaveCount(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${route}`).toBe(true);
            if (route !== '/join') {
              await expect(page.locator('.topbar')).toHaveCSS('background-color', width <= 900 ? 'rgb(17, 17, 19)' : 'rgba(255, 255, 255, 0.95)');
              await expect(page.locator('.brand-logo:visible')).toHaveAttribute('src', brand.asset_path);
            }
            if (route === '/' && width <= 900) {
              const hero = (await page.locator('.home-hero').boundingBox()).height;
              expect(hero).toBeLessThan(300);
              await expect(page.locator('.mobile-next-session')).toBeVisible();
              await expect(page.locator('.mobile-day-shortcuts a')).toHaveCount(3);
            }
            if (route === '/more/speakers') {
              await expect(page.locator('.speaker-directory-card')).toHaveCount(44);
              const first = page.locator('.speaker-directory-card img').first();
              await expect(first).toHaveCSS('object-fit', 'contain');
              await expect.poll(() => first.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
            }
            // Representative full-page scans at phone and approved desktop sizes;
            // all six widths still have explicit reflow and header checks.
            let accessibilityViolations = null;
            if ([390, 1440].includes(width)) {
              const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
              accessibilityViolations = scan.violations.length;
              // The approved desktop baseline contains pale decorative venue
              // ordinals (#d4d4da on white, 1.47:1). Jonathan explicitly asked
              // to preserve desktop appearance. Record that exact pre-existing
              // finding rather than recoloring desktop or claiming a clean AA
              // audit. All mobile findings and other desktop findings fail.
              const baseline = width === 1440 && route === '/more/venue'
                ? scan.violations.filter(item => item.id === 'color-contrast' && item.nodes.every(node => node.target.length === 1 && node.target[0] === '.venue-number')) : [];
              expect(scan.violations, `${engine.name()} ${width}px ${route}: unexpected accessibility regression`).toEqual(baseline);
              for (const item of baseline) knownDesktopFindings.push({ engine: engine.name(), width, route, rule: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })), baselineRevision: 'b71f9942087a0011d2b7ba30c337d7a3a0838060', disposition: 'Pre-existing desktop appearance preserved; not an accessibility conformance sign-off.' });
            }
            if ([390, 1440].includes(width) && ['/', '/agenda', '/more/speakers', '/inbox'].includes(route)) {
              await page.screenshot({ path: `${output}/${engine.name()}-${width}-${route === '/' ? 'home' : route.replaceAll('/', '-')}.png` });
            }
            checks.push({ engine: engine.name(), width, route, passed: true, accessibilityScanned: [390, 1440].includes(width), accessibilityViolations });
          }
          expect(errors).toEqual([]);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  report.passed = true;
  console.log(JSON.stringify({ passed: true, revision, views: checks.length, engines: engines.map(engine => engine.name()), knownDesktopFindings: knownDesktopFindings.length, screenshots: output }));
} catch (error) {
  writeFileSync(`${output}/failure.log`, String(error.stack || error));
  console.error(JSON.stringify({ passed: false, completedChecks: checks.length, details: `${output}/failure.log` }));
  process.exitCode = 1;
} finally { writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); }
