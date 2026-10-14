import 'server-only';
import { randomUUID } from 'node:crypto';
import type { serverSupabase } from '../supabase/server';
import { ApiError } from './http';

type Database = NonNullable<Awaited<ReturnType<typeof serverSupabase>>>;
/** Shared byte validation, metadata stripping, tenant folder and read-back verification. */
export async function saveEventImage(db: Database, eventId: string, owner: string, file: FormDataEntryValue | null, privateHeadshot = false) {
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ApiError(400, 'Choose a JPG, PNG or WebP under 3 MB.');
  const sharp = (await import('sharp')).default;
  let bytes: Buffer;
  try { bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: privateHeadshot ? 640 : 2400, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer(); }
  catch { throw new ApiError(400, 'This image could not be read. Please try a different JPG, PNG or WebP.'); }
  const bucket = privateHeadshot ? 'event-headshots' : 'event-assets';
  const path = `${eventId}/${owner}/${randomUUID()}.webp`;
  const upload = await db.storage.from(bucket).upload(path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: privateHeadshot ? '0' : '3600' });
  if (upload.error) throw new ApiError(503, 'The image upload did not complete. Please try again.');
  const verified = await db.storage.from(bucket).download(path);
  if (verified.error || !verified.data || verified.data.size !== bytes.byteLength) throw new ApiError(503, 'The uploaded image could not be verified. Please try again.');
  const url = !privateHeadshot ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : (await db.storage.from(bucket).createSignedUrl(path, 120)).data?.signedUrl;
  if (!url) throw new ApiError(503, 'The image was uploaded, but its preview is not available yet. Please try again.');
  return { path, url };
}
