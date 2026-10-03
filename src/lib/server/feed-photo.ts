import 'server-only';
import sharp from 'sharp';
import { photoUploadMaxBytes } from '../feed';
import { ApiError } from './http';

/** Decode real image bytes, orient before stripping EXIF, bound dimensions and
 * never forward user-supplied metadata or SVG/HTML from private storage. */
export async function normalizeFeedPhoto(input: Uint8Array): Promise<Buffer> {
  if (!input.byteLength || input.byteLength > photoUploadMaxBytes) throw new ApiError(413, 'Choose a photo under 3 MB after resizing.');
  try {
    const source = sharp(Buffer.from(input), { limitInputPixels: 40_000_000, animated: false });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported format');
    const bytes = await source.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    if (bytes.byteLength > photoUploadMaxBytes) throw new Error('Image too large');
    return bytes;
  } catch { throw new ApiError(400, 'This photo could not be read. Choose a JPG, PNG or WebP photo and try again.'); }
}
