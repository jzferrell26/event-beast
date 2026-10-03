import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
import { normalizeFeedPhoto } from '../src/lib/server/feed-photo';
import { feedPostInput, replyInput } from '../src/lib/feed';

describe('feed photo content boundaries',()=>{
  it('orients/resizes and removes metadata while producing bounded WebP bytes',async()=>{
    const source=await sharp({create:{width:3000,height:1200,channels:3,background:'#223344'}}).jpeg().withMetadata({orientation:6}).toBuffer();
    const output=await normalizeFeedPhoto(source), metadata=await sharp(output).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.width).toBeLessThanOrEqual(1920); expect(metadata.height).toBeLessThanOrEqual(1920);
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined(); expect(metadata.orientation).toBeUndefined(); expect(output.length).toBeLessThanOrEqual(3145728);
  });
  it('rejects fake images, SVG, zero-length and oversized bytes',async()=>{
    for(const bytes of [Buffer.from('<html>not an image</html>'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'),Buffer.alloc(0),Buffer.alloc(3145729)]) {
      await expect(normalizeFeedPhoto(bytes)).rejects.toThrow();
    }
  });
  it('allows photo-only posts but not empty posts or forged media paths/author ids',()=>{
    const clientId='71000000-0000-4000-8000-000000000042';
    expect(feedPostInput.safeParse({clientId,body:'',image:true}).success).toBe(true);
    expect(feedPostInput.safeParse({clientId,body:''}).success).toBe(false);
    expect(feedPostInput.safeParse({clientId,body:'Photo',image:true,image_path:'someone/else'}).success).toBe(false);
    expect(replyInput.safeParse({clientId,body:'',author_id:clientId}).success).toBe(false);
  });
});
