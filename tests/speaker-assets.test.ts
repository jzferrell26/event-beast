import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import official from '../data/official-speakers.json';
import supplemental from '../data/supplemental-speakers.json';

describe('published speaker source records', () => {
  it('retains real biographies rather than the old one-line import summaries', () => {
    expect(official.speakers.length).toBeGreaterThanOrEqual(42);
    for (const speaker of official.speakers) {
      expect(speaker.bio.length).toBeGreaterThan(40);
      expect(createHash('sha256').update(speaker.bio).digest('hex')).toBe(speaker.source_description_sha256);
      expect(speaker.source_url).toBe(official.source_url);
    }
  });
  it('keeps the two Erics separate and includes the reviewed supplemental sources', () => {
    const names = [...official.speakers, ...supplemental.speakers].map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['Garin Heslop', 'Eric Post', 'Eric Levin', 'Jay Jones', 'Dustin Owen', 'Brody Lee']));
    expect(supplemental.speakers.find(s => s.name === 'Jay Jones')?.source_url).toBe('https://cuantico.us/about');
    expect(supplemental.speakers.find(s => s.name === 'Eric Post')?.source_url).toBe('https://ericpost-thoughts.huzihalo.com/about/');
  });
  it('all source-linked portraits are real readable files with matching dimensions and checksums', async () => {
    for (const speaker of [...official.speakers, ...supplemental.speakers]) {
      const bytes = readFileSync(`public${speaker.headshot_path}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(speaker.image_sha256);
      const image = await sharp(bytes).metadata();
      expect(image.width).toBe(speaker.image_width);
      expect(image.height).toBe(speaker.image_height);
      expect(image.width).toBeGreaterThanOrEqual(200);
      expect(image.height).toBeGreaterThanOrEqual(200);
    }
  });
});
