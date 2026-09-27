import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// This captures only public speaker cards. Database changes are a separate,
// explicit operation in sync-official-speakers.mjs; it never imports attendees.
const source = 'https://www.momentumbuilderevent.com/';
const sha = value => createHash('sha256').update(value).digest('hex');
const key = name => name.normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
const previous = JSON.parse(await readFile('data/official-speakers.json', 'utf8'));
const previousByName = new Map(previous.speakers.map(speaker => [key(speaker.name), speaker]));
await mkdir('test-results/sources', { recursive: true });
await mkdir('public/speakers', { recursive: true });
await writeFile('test-results/sources/official-speakers-before.json', JSON.stringify(previous, null, 2));
const browser = await chromium.launch();
let cards;
try {
  const page = await browser.newPage();
  await page.route('**/*', route => ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  await page.goto(source, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('heading', { name: 'Don Goettling', exact: true }).waitFor();
  cards = await page.evaluate(() => Array.from(document.querySelectorAll('h2')).flatMap(heading => {
    const card = heading.closest('.list-item');
    const img = card?.querySelector('img');
    const description = card?.querySelector('.list-item-content__description');
    if (!card || !img || !description) return [];
    return [{
      name: heading.textContent.replace(/\s+/g, ' ').trim(),
      description: description.textContent.replace(/\s+/g, ' ').trim(),
      image: img.getAttribute('data-src') || img.getAttribute('src') || '',
    }];
  }));
  await writeFile('test-results/sources/official-speaker-cards.json', JSON.stringify(cards, null, 2));
} finally { await browser.close(); }

if (cards.length < previous.speakers.length || cards.length > 80 || new Set(cards.map(card => key(card.name))).size !== cards.length) {
  throw new Error(`Unexpected public speaker list (${cards.length}); review the source before replacing the import.`);
}
if (previous.speakers.some(speaker => !cards.some(card => key(card.name) === key(speaker.name)))) {
  throw new Error('An earlier official speaker is no longer present. Review removals rather than deleting a linked speaker.');
}
const records = [];
for (const card of cards) {
  if (!card.name || card.name.length > 120 || card.description.length < 10 || card.description.length > 5000) throw new Error('Malformed public speaker card');
  const old = previousByName.get(key(card.name));
  const url = new URL(card.image, source);
  if (url.protocol !== 'https:' || !['images.squarespace-cdn.com', 'static1.squarespace.com'].includes(url.hostname)) throw new Error(`Unapproved image host for ${card.name}`);
  url.searchParams.set('format', '750w');
  const slug = key(card.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `public/speakers/${slug}.webp`;
  let bytes;
  if (old && new URL(old.image_source_url).pathname === url.pathname) {
    try { bytes = await readFile(filename); } catch { /* Download missing source images below. */ }
    if (bytes && sha(bytes) !== old.image_sha256) throw new Error(`Local portrait was edited: ${card.name}. Review before overwriting it.`);
  }
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Headshot download failed for ${card.name}: ${response.status}`);
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length > 8 * 1024 * 1024) throw new Error(`Headshot is too large for ${card.name}`);
    bytes = await sharp(original, { limitInputPixels: 24000000 }).rotate()
      .resize({ width: 900, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    await writeFile(filename, bytes);
  }
  const dimensions = await sharp(bytes).metadata();
  records.push({ name: card.name, bio: card.description,
    previous_import_bio: old?.bio ?? '',
    previous_import_bios: [...new Set([old?.bio, old?.previous_import_bio, ...(old?.previous_import_bios ?? [])].filter(Boolean))],
    headshot_path: `/speakers/${slug}.webp`, source_url: source,
    image_source_url: url.href, image_sha256: sha(bytes), image_width: dimensions.width, image_height: dimensions.height,
    source_description_sha256: sha(card.description) });
}
await writeFile('data/official-speakers.json', JSON.stringify({ source_url: source, captured_at: new Date().toISOString(),
  description_policy: 'Published event speaker biographies, paired with portraits from the same named official card. No inferred credentials or generated biography filler. Source images are resized without cropping.', speakers: records }, null, 2) + '\n');
console.log(JSON.stringify({ captured: records.length, newSpeakers: records.filter(s => !previousByName.has(key(s.name))).map(s => s.name),
  previous: previous.speakers.length, biographies: records.map(s => ({ name: s.name, characters: s.bio.length })), databaseChanged: false }));
