import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// Local synthetic comparison only. Fix the browser clock to make screenshots
// comparable while preserving the live app's actual component implementations.
const stage = process.argv[2] || 'before';
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after.');
const origin = process.env.EVENT_BEAST_CAPTURE_ORIGIN || 'http://127.0.0.1:3102';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use a local synthetic server.');
const root = 'test-results/mobile-first';
mkdirSync(`${root}/${stage}`, { recursive: true });
const routes = [ ['/', 'home'], ['/agenda', 'agenda'], ['/people', 'people'], ['/inbox', 'inbox'], ['/inbox/70000000-0000-4000-8000-000000000101', 'thread'], ['/more/speakers', 'speakers'], ['/more/venue', 'venue'], ['/join', 'join'] ];
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-08T14:15:00Z'));
    for (const [route, name] of routes) {
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      await page.locator('h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      const file = `${width}-${name}.png`;
      const path = `${root}/${stage}/${file}`;
      await page.screenshot({ path, animations: 'disabled' });
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, heroHeight: document.querySelector('.home-hero')?.getBoundingClientRect().height ?? null }));
      const item = { width, route, ...dimensions };
      if (stage === 'after' && width === 1440) {
        const before = await sharp(readFileSync(`${root}/before/${file}`)).raw().toBuffer();
        const after = await sharp(readFileSync(path)).raw().toBuffer();
        let differences = 0;
        for (let index = 0; index < Math.max(before.length, after.length); index++) if (before[index] !== after[index]) differences++;
        item.desktopChangedChannels = differences;
        if (differences) process.exitCode = 1;
      }
      results.push(item);
    }
    await context.close();
  }
  writeFileSync(`${root}/${stage}/comparison.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ stage, results }));
} finally { await browser.close(); }
