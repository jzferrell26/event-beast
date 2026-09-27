import { chromium, devices, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Read-only. This verifier never signs anyone up, sends mail or mutates content.
// Require actual deployed provenance rather than stamping a historical commit.
const origin = new URL(process.env.EVENT_BEAST_VERIFY_ORIGIN || 'https://event-beast.vercel.app').origin;
if (!origin.startsWith('https://')) throw new Error('Use an HTTPS deployed website.');
const expectedRevision = process.env.EVENT_BEAST_EXPECTED_REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
if (!/^[a-f0-9]{40}$/i.test(expectedRevision)) throw new Error('Supply a complete expected Git commit.');
const destination = 'test-results/website-release';
// A documentation-only release can be rechecked without rewriting the tracked
// evidence again and creating an endless sequence of report-only deployments.
const reportPath = process.env.EVENT_BEAST_REPORT_PATH || 'docs/public-website-release.json';
mkdirSync(destination, { recursive: true });
const checks = [];
let release;
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], browserName: 'chromium' });
try {
  const metadata = await context.request.get(origin + '/api/release');
  expect(metadata.status()).toBe(200);
  expect(metadata.headers()['cache-control']).toContain('no-store');
  release = await metadata.json();
  expect(release.application).toBe('event-beast');
  expect(release.revision).toBe(expectedRevision);
  expect(release.mode).toBe('live');
  expect(typeof release.emailSignupOpen).toBe('boolean');
  expect(Object.keys(release).sort()).toEqual(['application', 'emailSignupOpen', 'mode', 'revision']);
  checks.push({ name: 'The live deployment identifies the expected Git revision without exposing private configuration', passed: true });

  const guideResponse = await context.request.get(origin + '/api/guide');
  expect(guideResponse.status()).toBe(200);
  expect(guideResponse.headers()['x-event-beast-public']).toBe('guide-v1');
  const guide = await guideResponse.json();
  expect(guide.mode).toBe('live');
  expect(guide.event.id).toBe('a9bdf080-f47f-538e-94f7-38e4ff996116');
  expect(guide.event.is_demo).toBe(false);
  expect(guide.days.length).toBeGreaterThan(0);
  expect(guide.sessions.length).toBeGreaterThan(0);
  expect(guide.sessions.every(session => session.published && !session.is_demo)).toBe(true);
  for (const name of ['registration_email', 'public_email', 'public_phone', 'contact_email', 'resolution_notes', 'reviewed_by', 'import_note']) expect(JSON.stringify(guide)).not.toContain(name);
  checks.push({ name: 'Published guide contains real public event content and omits private contacts and organizer review notes', passed: true });

  for (const route of ['/api/people', '/api/inbox', '/api/admin/launch', '/api/admin/users', '/api/sponsor', '/api/admin/contacts/30000000-0000-4000-8000-000000000101']) {
    const response = await context.request.get(origin + route);
    expect(response.status(), route).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
  checks.push({ name: 'Anonymous private API requests are denied and not cached', passed: true });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  const headed = guide.speakers.find(speaker => speaker.headshot_url);
  expect(headed).toBeTruthy();
  const routes = [['/', 'home'], ['/agenda', 'agenda'], ['/more/speakers', 'speakers'], [`/more/speakers/${headed.id}`, 'speaker-detail'], ['/more/sponsors', 'sponsors'], ['/more/help', 'help'], ['/join', 'join']];
  for (const [route, name] of routes) {
    await page.goto(origin + route, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.demo-strip')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })), route).toEqual([]);
    if (name === 'speaker-detail') {
      await expect(page.locator('.speaker-profile-hero img')).toBeVisible();
      expect(await page.locator('.speaker-profile-hero img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    if (name === 'join') {
      const button = page.getByRole('button', { name: 'Create my account', exact: true });
      await expect(page.getByRole('heading', { name: 'Make your entrance.' })).toBeVisible();
      if (release.emailSignupOpen) await expect(button).toBeEnabled();
      else {
        await expect(button).toBeDisabled();
        await expect(page.getByText('Account email delivery is being prepared by the event team.', { exact: false })).toBeVisible();
      }
    }
    await page.screenshot({ path: `${destination}/${name}.png`, fullPage: false });
    checks.push({ name: `Live mobile route ${route}: fits viewport and no automated accessibility violations`, passed: true });
    console.log(JSON.stringify({ verifiedRoute: route, accessibilityViolations: 0 }));
  }
  expect(pageErrors).toEqual([]);
  checks.push({ name: 'Public browser routes produce no uncaught page errors', passed: true });

  await page.goto(origin + '/');
  await page.evaluate(async () => { const worker = await navigator.serviceWorker.ready; worker.active?.postMessage({ type: 'REFRESH_PUBLIC_GUIDE' }); });
  await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open('event-beast-public-v1')).match('/api/guide'))), { timeout: 20000 }).toBe(true);
  await page.goto(origin + '/offline.html');
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#status')).toContainText('Offline');
  await expect(page.locator('#guide-content article').first()).toBeVisible();
  const cachedUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat());
  expect(cachedUrls.some(path => /^\/(?:auth|admin|people|inbox|api\/(?:me|people|inbox|admin|profile|release))(?:\/|$)/.test(path))).toBe(false);
  await context.setOffline(false);
  checks.push({ name: 'Public event essentials work offline while private responses and release metadata stay out of Cache Storage', passed: true });

  const report = { checkedAt: new Date().toISOString(), appRevision: release.revision, expectedRevision, deployment: process.env.EVENT_BEAST_DEPLOYMENT_URL || origin, alias: origin,
    mode: release.mode, emailSignupOpen: release.emailSignupOpen, realInboxDeliveryVerified: false, physicalDevicesVerified: false,
    contentCounts: { days: guide.days.length, sessions: guide.sessions.length, speakers: guide.speakers.length, headshots: guide.speakers.filter(speaker => speaker.headshot_url).length }, passed: true, checks };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ publicWebsitePassed: true, checks: checks.length, revision: release.revision, emailSignupOpen: release.emailSignupOpen, screenshots: destination }));
} catch (error) {
  writeFileSync(`${destination}/failure.log`, String(error.stack || error));
  writeFileSync(`${destination}/failure.json`, JSON.stringify({ passed: false, expectedRevision, observedRevision: release?.revision ?? null, completedChecks: checks.length }, null, 2));
  console.log(JSON.stringify({ publicWebsitePassed: false, completedChecks: checks.length, errorType: error.name, detail: `${destination}/failure.log` }));
  process.exitCode = 1;
} finally { await browser.close(); }
