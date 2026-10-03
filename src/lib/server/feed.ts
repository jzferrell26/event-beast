import 'server-only';
import type { FeedPost } from '../types';
import type { serverSupabase } from '../supabase/server';
import { ApiError, databaseError } from './http';
import { attendeeAvatarUrls } from './avatar-urls';

type Database = NonNullable<Awaited<ReturnType<typeof serverSupabase>>>;
type StoredPost = FeedPost & { image_path?: string | null };
export async function requireOpenWall(db: Database, eventId: string) {
  const settings = await db.from('event_settings').select('community_enabled,feed_enabled').eq('event_id', eventId).single();
  databaseError(settings.error);
  if (!settings.data?.community_enabled || !settings.data.feed_enabled) throw new ApiError(403, 'The event social wall is paused.');
}
export async function requireWallPost(db: Database, eventId: string, postId: string) {
  await requireOpenWall(db, eventId);
  const row = await db.from('feed_posts').select('id').eq('event_id', eventId).eq('id', postId).eq('status', 'visible').maybeSingle();
  databaseError(row.error);
  if (!row.data) throw new ApiError(404, 'This post is no longer available.');
}
export async function enrichFeedPosts(db: Database, eventId: string, posts: StoredPost[]): Promise<FeedPost[]> {
  if (!posts.length) return [];
  const [avatars, engagement] = await Promise.all([
    attendeeAvatarUrls(db, eventId, posts.map(post => post.author_id)),
    db.rpc('feed_engagement', { p_event: eventId, p_posts: posts.map(post => post.id) }),
  ]);
  databaseError(engagement.error);
  const counts = new Map<string, { like_count: number; liked_by_me: boolean; reply_count: number }>(
    (engagement.data ?? []).map((row: { post_id: string; like_count: number; liked_by_me: boolean; reply_count: number }) => [row.post_id, row])
  );
  return posts.map(({ image_path, ...post }) => ({ ...post, avatar_url: avatars.get(post.author_id),
    image_url: image_path ? `/api/feed/${post.id}/photo` : null,
    like_count: Number(counts.get(post.id)?.like_count ?? 0), liked_by_me: counts.get(post.id)?.liked_by_me ?? false,
    reply_count: Number(counts.get(post.id)?.reply_count ?? 0),
  }));
}
