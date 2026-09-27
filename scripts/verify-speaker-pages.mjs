import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

// Read-only verification of the real deployed public speaker experience.
const origin = 'https://event-beast.vercel.app';
const expectedRevision = process.env.EVENT_BEAST_EXPECTED_REVISION || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
const official = JSON.parse(readFileSync('data/official-speakers.json', 'utf8'));
const supplemental = JSON.parse(readFileSync('data/supplemental-speakers.json', 'utf8'));
const expected = [...official.speakers, ...supplemental.speakers];
const output = 'test-results/speaker-release';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const report = { checkedAt: new Date().toISOString(), expectedRevision, passed: false, biographies: 0, verifiedImages: 0, views: [] };
try {
  const release = await (await fetch(`${origin}/api/release`)).json();
  expect(release.revision).toBe(expectedRevision);
  expect(release.mode).toBe('live');
  const response = await fetch(`${origin}/api/guide`);
  expect(response.status).toBe(200);
  const guide = await response.json();
  expect(guide.speakers.length).toBe(expected.length);
  for (const row of expected) {
    const speaker = guide.speakers.find(s => s.full_name === row.name);
    expect(speaker, row.name).toBeTruthy();
    expect(speaker.bio, row.name).toBe(row.bio);
    expect(speaker.source_url).toBe(row.source_url);
    report.biographies++;
  }
  // Bounded public reads: verify hosted photos, not just local file existence.
  for (let index = 0; index < expected.length; index += 4) {
    await Promise.all(expected.slice(index, index + 4).map(async row => {
      const speaker = guide.speakers.find(s => s.full_name === row.name);
      const image = await fetch(speaker.headshot_url, { signal: AbortSignal.timeout(20000) });
      expect(image.status, row.name).toBe(200);
      const bytes = Buffer.from(await image.arrayBuffer());
      expect(createHash('sha256').update(bytes).digest('hex'), row.name).toBe(row.image_sha256);
      const meta = await sharp(bytes).metadata();
      expect(meta.width).toBe(row.image_width); expect(meta.height).toBe(row.image_height);
      report.verifiedImages++;
    }));
  }
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/more/speakers`, { waitUntil: 'networkidle' });
    await expect(page.locator('.speaker-card')).toHaveCount(expected.length);
    await page.evaluate(() => document.fonts.ready);
    for (const row of expected) {
      const card = page.getByRole('link', { name: `View speaker profile for ${row.name}`, exact: true });
      await expect(card.locator('.speaker-card-bio')).toHaveText(row.bio);
      const image = card.locator('.speaker-portrait img');
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(image).toHaveCSS('object-fit', 'contain');
      await expect(image).toHaveCSS('border-radius', '0px');
    }
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const directoryScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(directoryScan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.screenshot({ path: `${output}/${device}-directory.png` });
    report.views.push({ device, view: 'directory', visiblePortraits: expected.length, accessibilityViolations: 0 });
    for (const name of ['Brian Biro', 'Garin Heslop', 'Jay Jones', 'Eric Post']) {
      const speaker = guide.speakers.find(s => s.full_name === name);
      await page.goto(`${origin}/more/speakers/${speaker.id}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.locator('.speaker-biography p')).toHaveText(speaker.bio);
      await expect(page.locator('.speaker-profile-hero img')).toHaveCSS('object-fit', 'contain');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      const slug = name.toLowerCase().replaceAll(' ', '-');
      await page.screenshot({ path: `${output}/${device}-${slug}.png` });
      report.views.push({ device, view: name, accessibilityViolations: 0 });
    }
    expect(errors).toEqual([]);
    await context.close();
  }
  report.passed = true;
  console.log(JSON.stringify(report));
} catch (error) {
  writeFileSync(`${output}/failure.log`, String(error.stack || error));
  console.log(JSON.stringify({ passed: false, biographies: report.biographies, images: report.verifiedImages, details: `${output}/failure.log` }));
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
