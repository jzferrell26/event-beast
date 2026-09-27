import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// These two existing agenda speakers are not on the current public event list.
// Use their own published company/author sources, never a same-name image search.
const sources = [
  {
    name: 'Jay Jones', source_url: 'https://cuantico.us/about',
    image_source_page: 'https://cuantico.us/about',
    image_source_url: 'https://cuantico.us/lovable-uploads/cc78f746-af4d-47d9-8405-12d7c24a8e72.png',
    bio: 'Jay Jones is the Founder and CEO of Cuantico AI. His background spans telecommunications and business coaching, and his work focuses on applying AI-powered voice technology to lead qualification, follow-up, and more effective client conversations.',
  },
  {
    name: 'Eric Post', source_url: 'https://ericpost-thoughts.huzihalo.com/about/',
    image_source_page: 'https://www.huzilaunch.com/',
    image_source_url: 'https://static.wixstatic.com/media/94eb8f_e4c91d908f5f4549a0c4593d1c18c821~mv2.jpg',
    bio: 'Eric Post is the Founder and CEO of Huzi.ai, a speaker, strategist, and investor focused on practical, human-centered AI. He has built and operated businesses across real estate, mortgage, health, wellness, and technology, and advises leaders on AI strategy, business judgment, and customer trust.',
  },
];
await mkdir('public/speakers', { recursive: true });
const records = [];
for (const source of sources) {
  const response = await fetch(source.image_source_url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Official portrait unavailable for ${source.name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Image exceeds the size limit');
  const optimized = await sharp(bytes, { limitInputPixels: 24000000 }).rotate()
    .resize({ width: 900, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const headshot_path = `/speakers/${source.name.toLowerCase().replaceAll(' ', '-')}.webp`;
  const meta = await sharp(optimized).metadata();
  await writeFile(`public${headshot_path}`, optimized);
  records.push({ ...source, previous_import_bio: '', headshot_path, image_width: meta.width, image_height: meta.height,
    image_sha256: createHash('sha256').update(optimized).digest('hex') });
}
await writeFile('data/supplemental-speakers.json', JSON.stringify({ captured_at: new Date().toISOString(),
  description_policy: 'Factual professional summaries sourced from the speakers’ own published websites. Photos paired by the company/author page, not face recognition.', speakers: records }, null, 2) + '\n');
console.log(JSON.stringify({ prepared: records.map(s => s.name), databaseChanged: false }));
