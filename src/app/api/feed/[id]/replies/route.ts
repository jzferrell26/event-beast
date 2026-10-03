import { z } from 'zod';
import { requireMember } from '@/lib/server/auth';
import { ApiError, databaseError, handle, json, parseBody } from '@/lib/server/http';
import { requireWallPost } from '@/lib/server/feed';
import { attendeeAvatarUrls } from '@/lib/server/avatar-urls';
import { feedCursor, replyInput, replySelect } from '@/lib/feed';
type Context = { params: Promise<{ id: string }> };

export const GET = (request: Request, context: Context) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const { db, event } = await requireMember();
  await requireWallPost(db, event.id, id);
  let query = db.from('feed_replies').select(replySelect).eq('event_id', event.id).eq('post_id', id).eq('status', 'visible')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(31);
  const raw = new URL(request.url).searchParams.get('cursor');
  if (raw) {
    let value: unknown; try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid reply cursor.'); }
    const cursor = feedCursor.parse(value);
    query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  }
  const result = await query; databaseError(result.error);
  const replies = (result.data ?? []).slice(0, 30);
  const avatars = await attendeeAvatarUrls(db, event.id, replies.map(reply => reply.author_id));
  const last = replies.at(-1);
  return json({ replies: replies.map(reply => ({ ...reply, avatar_url: avatars.get(reply.author_id) })),
    nextCursor: result.data?.length === 31 && last ? JSON.stringify({ at: last.created_at, id: last.id }) : null });
});
export const POST = (request: Request, context: Context) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const body = await parseBody(request, replyInput);
  const { db, event } = await requireMember();
  const result = await db.rpc('publish_feed_reply', { p_event: event.id, p_post: id, p_client: body.clientId, p_body: body.body });
  databaseError(result.error);
  return json({ saved: true, id: result.data?.id }, 201);
});
