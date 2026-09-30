import { z } from 'zod';
export const feedSelect = 'id,author_id,author_name,body,status,version,created_at,updated_at';
export const feedCursor = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export const feedPostInput = z.object({ clientId: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict();
export const feedEditInput = z.object({ version: z.number().int().nonnegative(), body: z.string().trim().max(2000), remove: z.boolean().default(false) }).strict();
