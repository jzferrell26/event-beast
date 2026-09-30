import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Only the six original files in Sonia's explicitly supplied folder. No page
// scripts, instructions, credentials or unrelated links are executed.
const names = new Set(['Auto Apt Engine.png', 'Braincode.pdf', 'figure ad.png', 'nftydoor ad.gif', 'Total Expert ad.png', 'xactus ad.png']);
const output = path.resolve('test-results/sonia-ad-originals');
await mkdir(output, { recursive: true });
const html = await readFile('test-results/dropbox-source.html', 'utf8');
const links = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')))];
const results = [];
for (const raw of links) {
  let url; try { url = new URL(raw); } catch { continue; }
  const name = decodeURIComponent(url.pathname.split('/').at(-1));
  if (url.hostname !== 'www.dropbox.com' || !url.pathname.startsWith('/scl/fo/5llq9an7rtee4dfxipmcj/') || !names.has(name)) continue;
  const destination = path.join(output, name);
  try {
    if (await stat(destination).catch(() => null)) { results.push({ name, reused: true }); continue; }
    url.searchParams.set('dl', '1');
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/html') || bytes.length < 100 || bytes.length > 20 * 1024 * 1024) throw new Error('Unexpected file content');
    await writeFile(destination, bytes);
    results.push({ name, bytes: bytes.length, type, sha256: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) { results.push({ name, failed: true, error: error.message }); }
}
await writeFile(path.join(output, 'intake.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.length !== 6 || results.some(result => result.failed)) process.exitCode = 1;
