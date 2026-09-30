/** Read-only extraction of the captured official site; never writes to Supabase. */
import { readFile, writeFile } from 'node:fs/promises';
const input = process.argv[2] || 'test-results/official-source.html';
const html = (await readFile(input, 'utf8')).replace(/^\uFEFF/, '');
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const rows = [];
let tier = '';
for (const match of html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>|<img\b[^>]*>/gi)) {
  const tag = match[0];
  if (/^<h2/i.test(tag)) {
    const text = decode(tag.replace(/<[^>]+>/g, '').trim());
    if (/partners/i.test(text)) tier = text;
    continue;
  }
  if (!tier) continue;
  const attr = key => decode(tag.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`, 'i'))?.[1] || '');
  const src = attr('data-src') || attr('src');
  if (!src.startsWith('https://images.squarespace-cdn.com/')) continue;
  const sourceFile = decodeURIComponent(new URL(src).pathname.split('/').at(-1)).replaceAll('+', ' ');
  rows.push({ tier, source_order: rows.filter(row => row.tier === tier).length + 1, source_file: sourceFile, logo_url: src, alt: attr('alt') });
}
if (!rows.length) throw new Error('No sponsor rows found. Refresh the official browser capture; do not overwrite the reference with an empty result.');
const result = { source: 'https://www.momentumbuilderevent.com/', captured_at: new Date().toISOString(), note: 'Source DOM order. Confirm visual order and names against the official site before import. This file does not change live content.', rows };
await writeFile('docs/official-sponsor-reference.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ count: rows.length, rows: rows.map(({ tier, source_order, source_file }) => ({ tier, source_order, source_file })) }, null, 2));
