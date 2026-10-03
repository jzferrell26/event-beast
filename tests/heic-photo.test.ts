import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isHeicPhoto } from '../src/lib/prepare-feed-photo';

describe('phone photo format detection',()=>{
  it('recognizes genuine HEIC bytes even when the browser MIME type is missing',async()=>{
    const bytes=await readFile('tests/fixtures/photos/example.heic');
    expect(await isHeicPhoto(new Blob([new Uint8Array(bytes)]))).toBe(true);
  });
  it('does not mistake JPEG bytes for HEIC',async()=>{
    expect(await isHeicPhoto(new Blob([new Uint8Array([0xff,0xd8,0xff,0xe0,0,1,2,3])]))).toBe(false);
  });
});
