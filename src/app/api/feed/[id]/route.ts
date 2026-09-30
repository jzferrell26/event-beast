import { z } from 'zod';
import { requireMember } from '@/lib/server/auth';
import { databaseError, handle, json, parseBody } from '@/lib/server/http';
import { feedEditInput } from '@/lib/feed';
type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, context: Context) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const body = await parseBody(request, feedEditInput);
  const { db, event } = await requireMember();
  const result = await db.rpc('edit_feed_post', { p_event: event.id, p_post: id, p_version: body.version, p_body: body.body, p_delete: body.remove });
  databaseError(result.error); return json({ saved: true });
});
export const POST = (request: Request, context: Context) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const body = await parseBody(request, z.object({ reason: z.string().trim().min(3).max(1000) }).strict());
  const { db, event } = await requireMember();
  const result = await db.rpc('report_feed_post', { p_event: event.id, p_post: id, p_reason: body.reason });
  databaseError(result.error); return json({ saved: true });
});
