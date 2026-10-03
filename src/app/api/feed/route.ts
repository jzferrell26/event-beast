import { requireMember } from '@/lib/server/auth';
import { isDemo } from '@/lib/server/guide';
import { ApiError, databaseError, handle, json, parseBody } from '@/lib/server/http';
import { feedCursor, feedPostInput, feedSelect } from '@/lib/feed';
import { enrichFeedPosts } from '@/lib/server/feed';

export const GET = (request: Request) => handle(async () => {
  if (isDemo()) return json({ posts: [], nextCursor: null, demo: true });
  const { db, event } = await requireMember();
  const settings = await db.from('event_settings').select('community_enabled,feed_enabled').eq('event_id', event.id).single();
  databaseError(settings.error);
  if (!settings.data?.community_enabled || !settings.data.feed_enabled) throw new ApiError(403, 'The event social wall is paused.');
  const raw = new URL(request.url).searchParams.get('cursor');
  let search = db.from('feed_posts').select(feedSelect).eq('event_id', event.id).eq('status', 'visible').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(31);
  if (raw) { let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid feed cursor.'); } const cursor = feedCursor.parse(parsed); search = search.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`); }
  const result = await search;
  databaseError(result.error);
  const posts = (result.data ?? []).slice(0, 30);
  const last = posts.at(-1);
  return json({ posts: await enrichFeedPosts(db, event.id, posts), nextCursor: result.data?.length === 31 && last ? JSON.stringify({ at: last.created_at, id: last.id }) : null });
});
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, feedPostInput);
  const { db, event } = await requireMember();
  const result = body.photoCount === undefined
    ? await db.rpc('publish_feed_post_with_photo', { p_event: event.id, p_client: body.clientId, p_body: body.body, p_image: body.image })
    : await db.rpc('publish_feed_post_with_photos', { p_event: event.id, p_client: body.clientId, p_body: body.body, p_count: body.photoCount });
  databaseError(result.error);
  return json({ saved: true, id: result.data?.id }, 201);
});
