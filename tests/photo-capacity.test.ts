import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
vi.mock('server-only',()=>({}));
import { createPhotoWorkLimit } from '../src/lib/server/photo-work';
import { normalizeFeedPhoto } from '../src/lib/server/feed-photo';
import { photoDerivativeMaxBytes } from '../src/lib/feed';

describe('photo capacity safeguards (local, not hosted load certification)',()=>{
  it('bounds active image work and rejects excess queued work without an unbounded backlog',async()=>{
    const run=createPhotoWorkLimit(2,3);let active=0,peak=0;
    const releases:(()=>void)[]=[];
    const jobs=Array.from({length:5},()=>run(async()=>{active++;peak=Math.max(active,peak);await new Promise<void>(resolve=>releases.push(resolve));active--;return true;}));
    await expect(run(async()=>true)).rejects.toThrow(/busy/);
    while(releases.length){releases.shift()!();await new Promise(resolve=>setTimeout(resolve,0));}
    expect(await Promise.all(jobs)).toEqual([true,true,true,true,true]);expect(peak).toBe(2);
  });
  it('serially normalizes a five-photo album below the hard derivative budget',async()=>{
    const source=await sharp({create:{width:3000,height:2000,channels:3,background:'#447788'}}).jpeg().toBuffer();
    let total=0;
    for(let i=0;i<5;i++){const bytes=await normalizeFeedPhoto(source);expect(bytes.length).toBeLessThanOrEqual(photoDerivativeMaxBytes);total+=bytes.length;}
    expect(total).toBeLessThanOrEqual(5*photoDerivativeMaxBytes);
  });
  it('processes a bounded concurrent noisy-photo workload and records local resource evidence',async()=>{
    const source=await sharp(randomBytes(1920*1280*3),{raw:{width:1920,height:1280,channels:3}}).jpeg({quality:85}).toBuffer();
    let peakRss=process.memoryUsage().rss,next=0,largest=0,completed=0;
    const initialRss=peakRss,started=performance.now();
    const timer=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},20);
    try {
      await Promise.all(Array.from({length:4},async()=>{
        for(;;){const index=next++;if(index>=20)return;const bytes=await normalizeFeedPhoto(source);expect(bytes.length).toBeLessThanOrEqual(photoDerivativeMaxBytes);largest=Math.max(largest,bytes.length);completed++;}
      }));
    }finally{clearInterval(timer);}
    expect(completed).toBe(20);
    const evidence={scope:'Local image normalization only; not a hosted 500-user test',photos:completed,callers:4,inputBytes:source.length,largestOutputBytes:largest,durationMs:Math.round(performance.now()-started),initialRssBytes:initialRss,peakRssBytes:peakRss};
    await mkdir('test-results/photo-capacity',{recursive:true});await writeFile('test-results/photo-capacity/result.json',JSON.stringify(evidence,null,2)+'\n');
  },60000);
});
