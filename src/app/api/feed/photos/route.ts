import { z } from 'zod';
import { requireMember } from '@/lib/server/auth';
import { ApiError, assertSameOrigin, handle, json, parseBody } from '@/lib/server/http';
import { requireOpenWall } from '@/lib/server/feed';
import { normalizeFeedPhoto } from '@/lib/server/feed-photo';
import { photoUploadMaxBytes } from '@/lib/feed';
import { runPhotoUpload } from '@/lib/server/photo-work';

export const maxDuration = 30;
export const POST = (request: Request) => handle(async () => {
  assertSameOrigin(request);
  const { db, event, attendee } = await requireMember();
  await requireOpenWall(db, event.id);
  return runPhotoUpload(async () => {
  if (Number(request.headers.get('content-length') ?? 0) > 3.5 * 1024 * 1024) throw new ApiError(413, 'Choose a smaller photo.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Choose a photo.');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > 3.5 * 1024 * 1024) { await reader.cancel(); throw new ApiError(413, 'Choose a smaller photo.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
  const clientId = z.uuid().parse(form.get('clientId'));
  if (form.getAll('file').length !== 1) throw new ApiError(400, 'Upload one photo at a time.');
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > photoUploadMaxBytes || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiError(400, 'Choose a JPG, PNG or WebP photo under 3 MB after resizing.');
  }
  const bytes = await normalizeFeedPhoto(new Uint8Array(await file.arrayBuffer()));
  const path = `${event.id}/${attendee.id}/${clientId}.webp`;
  const storage = db.storage.from('event-feed-photos');
  const upload = await storage.upload(path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '0' });
  // Deterministic path + byte comparison recovers a lost success response without
  // overwriting an already attached image or creating a second object.
  const existing = await storage.download(path);
  if (existing.error || !existing.data) throw new ApiError(503, 'The photo upload was not confirmed. Your draft is safe; try again.');
  const stored = Buffer.from(await existing.data.arrayBuffer());
  if (!stored.equals(bytes)) throw new ApiError(409, 'This request already contains a different photo. Choose the photo again.');
  if (upload.error && !stored.length) throw new ApiError(503, 'The photo upload was not confirmed.');
  return json({ uploaded: true, clientId });
  });
});
export const DELETE = (request: Request) => handle(async () => {
  const { clientId } = await parseBody(request, z.object({ clientId: z.uuid() }).strict());
  const { db, event, attendee } = await requireMember();
  const path = `${event.id}/${attendee.id}/${clientId}.webp`;
  const attached = await db.from('feed_posts').select('id').eq('event_id', event.id).eq('author_id', attendee.id).eq('image_path', path).maybeSingle();
  if (attached.error) throw new ApiError(503, 'The photo could not be checked.');
  if (attached.data) return json({ removed: false, attached: true });
  const removed = await db.storage.from('event-feed-photos').remove([path]);
  if (removed.error) throw new ApiError(503, 'The unused photo could not be removed yet.');
  return json({ removed: true });
});
