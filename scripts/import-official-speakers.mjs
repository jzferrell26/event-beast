import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = 'https://www.momentumbuilderevent.com/';
const descriptions = {
  'Neel Dhingra': 'Personal-branding educator.', 'Michael Burt': 'High-performance coach.',
  'Rory Vaden': 'Author and speaker.', 'Sasha Stair': 'Xactus marketing executive.',
  'Dave Savage': 'Mortgage Coach founder.', 'Anita Padilla-Fitzgerald': 'Fintech founder.',
  'Rachel Lambert': 'Braincode Centers founder.', 'Neena Vlamis': 'Mortgage company founder.',
  'Deborah Byrd': 'Social-media agency founder.', 'Chris Welton': 'Performance coach and author.',
  'Rose Marie David': 'CMG lending executive.', 'Brady Thomas': 'CMG branch manager.',
  'Alex Varela': 'Neighborhood Loans sales leader.', 'Angie Noack': 'Braincode Centers executive.',
  'Nicki Montelongo': 'NEO mortgage originator.', 'Brian Biro': 'Breakthrough speaker.',
  'Candice McNaught': 'Planet Home Lending executive.', 'Abdel Khawatmi': 'PRMG originator.',
  'Ross Bernstein': 'Coach and sports author.', 'Bill Hart': 'Executive coach.',
  'Jim McMahan': 'Benchmark Mortgage president.', 'Thomas Meister': 'Ascendant Partners founder.',
  'Allison Johnston': 'Success Mortgage Partners president.', 'Lyra Waggoner': 'Movement Mortgage COO.',
  'Jeremy Forcier': 'Originator and coach.', 'Angelica Ventrice': 'Leadership performance coach.',
  'Simon Thomsen': 'Peak-performance coach.', 'Robert Clark': 'Income-protection specialist.',
  'Josh Pitts': 'ShrEDIT founder.', 'Haley Parker': 'Fairway business-development leader.',
  'Jason Jacobs': 'Guild Mortgage originator.', 'Sam Mistretta': 'Auto Appointment Engine founder.',
  'Ken Perry': 'Knowledge Coop founder.', 'Kristin Messerli': 'FirstHome IQ executive director.',
  'Andrew Moon': 'West Capital Lending executive.', 'Craig Davis': 'Ascend Xperience founder.',
  'Gino Fronti': 'Momentum Builder co-founder.', 'Don Goettling': 'Momentum Builder founder.',
};
await mkdir('test-results/sources', { recursive: true });
await mkdir('data', { recursive: true });
await mkdir('public/speakers', { recursive: true });
const browser = await chromium.launch();
let cards;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', route => ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  await page.goto(source, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('heading', { name: 'Don Goettling', exact: true }).waitFor();
  cards = await page.evaluate(() => Array.from(document.querySelectorAll('h2')).flatMap(heading => {
    const card = heading.closest('.list-item') ?? heading.closest('li');
    const img = card?.querySelector('img');
    if (!card || !img) return [];
    const name = heading.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const description = card.querySelector('.list-item-content__description')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return [{ name, description, image: img.getAttribute('data-src') || img.getAttribute('src') || '' }];
  }));
  await writeFile('test-results/sources/official-speaker-cards.json', JSON.stringify(cards, null, 2));
} finally { await browser.close(); }

const records = [];
for (const card of cards) {
  if (!Object.hasOwn(descriptions, card.name)) continue;
  const url = new URL(card.image, source);
  if (url.protocol !== 'https:' || !['images.squarespace-cdn.com', 'static1.squarespace.com'].includes(url.hostname)) throw new Error(`Unapproved image host for ${card.name}`);
  url.searchParams.set('format', '500w');
  const slug = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `public/speakers/${slug}.webp`;
  let bytes;
  try { bytes = await readFile(filename); }
  catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Headshot download failed for ${card.name}: ${response.status}`);
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length > 8 * 1024 * 1024) throw new Error(`Headshot is too large for ${card.name}`);
    bytes = await sharp(original, { limitInputPixels: 24000000 }).rotate().resize({ width: 600, height: 750, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    await writeFile(filename, bytes);
  }
  records.push({ name: card.name, bio: descriptions[card.name], headshot_path: `/speakers/${slug}.webp`, source_url: source,
    image_source_url: url.href, image_sha256: createHash('sha256').update(bytes).digest('hex'),
    source_description_sha256: createHash('sha256').update(card.description).digest('hex') });
}
if (records.length !== Object.keys(descriptions).length || new Set(records.map(r => r.name)).size !== records.length) throw new Error(`Expected 38 distinct official profiles; found ${records.length}. Review source changes.`);
await writeFile('data/official-speakers.json', JSON.stringify({ source_url: source, captured_at: new Date().toISOString(), description_policy: 'Concise factual descriptions based on the official event site. Full source text is not republished. Names and images are paired from the same official card.', speakers: records }, null, 2) + '\n');
console.log(JSON.stringify({ imported: records.length, headshots: records.length, missing: [], destination: 'data/official-speakers.json' }));
