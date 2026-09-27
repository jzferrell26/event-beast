import { chromium, devices, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// Read-only deployed-website checks, except a signup request explicitly rejected
// by the email-ready gate before it can create an account or send an email.
const origin = 'https://event-beast.vercel.app';
const appRevision = '7ffc599f5b6281ee43c1307e3d405d93835144ab';
const destination = 'test-results/website-release';
mkdirSync(destination, { recursive: true });
const checks = [];
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], browserName: 'chromium' });
try {
  const guideResponse = await context.request.get(origin + '/api/guide');
  expect(guideResponse.status()).toBe(200);
  const guide = await guideResponse.json();
  expect(guide.mode).toBe('live');
  expect(guide.event.id).toBe('a9bdf080-f47f-538e-94f7-38e4ff996116');
  expect(guide.days).toHaveLength(3); expect(guide.sessions).toHaveLength(33);
  expect(guide.speakers).toHaveLength(41);
  expect(guide.speakers.filter(s => s.headshot_url)).toHaveLength(38);
  for (const name of ['registration_email', 'public_email', 'public_phone', 'contact_email']) expect(JSON.stringify(guide)).not.toContain(name);
  checks.push({ name: 'Published guide uses the dedicated real event and omits private contact fields', passed: true });

  for (const route of ['/api/people', '/api/admin/users', '/api/sponsor', '/api/admin/contacts/30000000-0000-4000-8000-000000000101']) {
    const response = await context.request.get(origin + route);
    expect(response.status(), route).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
  checks.push({ name: 'Anonymous private API requests are denied and not cached', passed: true });

  const page = await context.newPage();
  const headed = guide.speakers.find(s => s.headshot_url);
  const routes = [['/', 'home'], ['/agenda', 'agenda'], ['/more/speakers', 'speakers'], [`/more/speakers/${headed.id}`, 'speaker-detail'], ['/join', 'join']];
  for (const [route, name] of routes) {
    await page.goto(origin + route, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.demo-strip')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violations = scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
    expect(violations, route).toEqual([]);
    if (name === 'speaker-detail') {
      await expect(page.locator('.speaker-profile-hero img')).toBeVisible();
      expect(await page.locator('.speaker-profile-hero img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    if (name === 'join') {
      await expect(page.getByRole('heading', { name: 'Make your entrance.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create my account', exact: true })).toBeDisabled();
      await expect(page.getByText('Account email delivery is being prepared by the event team.', { exact: false })).toBeVisible();
    }
    await page.screenshot({ path: `${destination}/${name}.png`, fullPage: false });
    checks.push({ name: `Live mobile route ${route}: readable, fits viewport and no automated accessibility violations`, passed: true });
    console.log(JSON.stringify({ verifiedRoute: route, accessibilityViolations: 0 }));
  }
  const signup = await context.request.post(origin + '/api/auth', { headers: { Origin: origin }, data: { action: 'sign-up', email: 'public-gate-check@example.test', password: 'Unused-gate-check-password!' } });
  expect(signup.status()).toBe(503);
  expect((await signup.json()).error).toContain('email delivery is being prepared');
  checks.push({ name: 'Email-ready gate rejects new signup before Auth/email operation', passed: true });

  await page.goto(origin + '/');
  await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    worker.active?.postMessage({ type: 'REFRESH_PUBLIC_GUIDE' });
  });
  await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open('event-beast-public-v1')).match('/api/guide'))), { timeout: 15000 }).toBe(true);
  await page.goto(origin + '/offline.html');
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#status')).toContainText('Offline');
  await expect(page.locator('#guide-content article').first()).toBeVisible();
  await context.setOffline(false);
  checks.push({ name: 'Published public event essentials remain readable offline', passed: true });
  writeFileSync('docs/public-website-release.json', JSON.stringify({ checkedAt: new Date().toISOString(), appRevision, deployment: 'https://event-beast-51bxm7po9-cuantico-ai.vercel.app', alias: origin, mode: 'live', emailSignupOpen: false, passed: true, checks }, null, 2) + '\n');
  console.log(JSON.stringify({ publicWebsitePassed: true, checks: checks.length, emailSignupOpen: false, screenshots: destination }));
} catch (error) {
  writeFileSync(`${destination}/failure.log`, String(error.stack || error));
  console.log(JSON.stringify({ publicWebsitePassed: false, completedChecks: checks.length, errorType: error.name, detail: `${destination}/failure.log` }));
  process.exitCode = 1;
} finally { await browser.close(); }
