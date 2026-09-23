import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve("public/icons");
await mkdir(directory, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#17171b"/><path d="M104 136h69l34 84 34-84h69v240h-55V221l-48 108-48-108v155h-55z" fill="#fff"/><path d="M321 136h51c55 0 79 24 79 65 0 22-9 39-27 50 22 10 33 29 33 57 0 45-30 68-85 68h-51v-48h49c18 0 28-8 28-25 0-17-10-25-28-25h-30v-46h28c16 0 23-8 23-23 0-17-8-25-25-25h-45z" fill="#e12632"/><rect x="104" y="400" width="306" height="8" rx="4" fill="#e12632"/></svg>`;
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(directory, name));
}
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#17171b" } }).composite([{ input: await sharp(Buffer.from(svg)).resize(360, 360).png().toBuffer(), left: 76, top: 76 }]).png().toFile(path.join(directory, "maskable-512.png"));
console.log("Created four Event Beast PWA icons.");
