import { z } from 'zod';
export const feedSelect = 'id,author_id,author_name,body,status,version,created_at,updated_at,image_path,photo_count';
export const replySelect = 'id,post_id,author_id,author_name,body,status,version,created_at,updated_at';
export const feedCursor = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export const maxFeedPhotos = 5;
export const feedPostInput = z.object({ clientId: z.uuid(), body: z.string().trim().max(2000), image: z.boolean().default(false), photoCount: z.number().int().min(0).max(maxFeedPhotos).optional() }).strict().refine(value => (value.photoCount ?? (value.image ? 1 : 0)) > 0 || value.body.length > 0, 'Add a photo or some text.');
export const feedEditInput = z.object({ version: z.number().int().nonnegative(), body: z.string().trim().max(2000), remove: z.boolean().default(false) }).strict();
export const replyInput = z.object({ clientId: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict();
export const reportInput = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
export const photoUploadMaxBytes = 3 * 1024 * 1024;
export const photoDerivativeMaxBytes = 1024 * 1024;
export const photoSlot = z.number().int().min(1).max(maxFeedPhotos);
export function feedPhotoPath(event: string, attendee: string, client: string, slot = 1) {
  photoSlot.parse(slot);
  return `${event}/${attendee}/${client}${slot === 1 ? '' : '-' + slot}.webp`;
}
