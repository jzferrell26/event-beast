import { z } from 'zod';
import { requireMember } from '@/lib/server/auth';
import { databaseError, handle, json, parseBody } from '@/lib/server/http';
export const PUT = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const { liked } = await parseBody(request, z.object({ liked: z.boolean() }).strict());
  const { db, event } = await requireMember();
  const result = await db.rpc('set_feed_like', { p_event: event.id, p_post: id, p_liked: liked });
  databaseError(result.error);
  const summary = await db.rpc('feed_engagement', { p_event: event.id, p_posts: [id] });
  databaseError(summary.error);
  return json({ saved: true, ...(summary.data?.[0] ?? {}) });
});
