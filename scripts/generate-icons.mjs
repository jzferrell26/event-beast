import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from "node:path";
const directory = path.resolve("public/icons");
await mkdir(directory, { recursive: true });
const source = await readFile('public/branding/momentum-builder-mark.png');
assert.equal(createHash('sha256').update(source).digest('hex'), 'a18d3fd4ecb2c95bfcb6cacb758795de8fab9def85147a7bcc40ab9c657fe4aa', 'Use Sonia’s original M icon, not a recreated mark.');
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180],["momentum-mark-32.png",32],["momentum-mark-192.png",192],["momentum-mark-512.png",512],["momentum-mark-180.png",180]]) {
  await sharp(source).flatten({ background: '#000000' }).resize(size, size, { fit: 'contain', background: '#000000' }).png().toFile(path.join(directory, name));
}
const mask = await sharp({ create: { width:512,height:512,channels:4,background:'#000000' } }).composite([{ input: await sharp(source).flatten({ background:'#000000' }).resize(400,400,{fit:'contain',background:'#000000'}).png().toBuffer(),left:56,top:56 }]).png().toBuffer();
await sharp(mask).toFile(path.join(directory,'maskable-512.png'));
await sharp(mask).toFile(path.join(directory,'momentum-mark-maskable-512.png'));
console.log('Created original-artwork favicon, Apple and PWA icons; full header logo unchanged.');
