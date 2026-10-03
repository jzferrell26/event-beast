import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { isDemo } from '@/lib/server/guide';
import { databaseError, handle, json, parseBody } from '@/lib/server/http';
import { feedSelect } from '@/lib/feed';
import { enrichFeedPosts } from '@/lib/server/feed';
export const GET = (request: Request) => handle(async () => {
  if (isDemo()) return json({ posts: [], reports: [], hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get('offset')) || 0, 10000));
  const [posts, reports] = await Promise.all([
    db.from('feed_posts').select(feedSelect).eq('event_id', event.id).order('created_at', { ascending: false }).order('id').range(offset, offset + 50),
    db.from('feed_reports').select('id,post_id,reason,status,created_at').eq('event_id', event.id).eq('status', 'open').order('created_at').limit(100),
  ]);
  databaseError(posts.error); databaseError(reports.error);
  const missingIds = [...new Set((reports.data ?? []).map(report => report.post_id))].filter(id => !(posts.data ?? []).some(post => post.id === id));
  const reported = missingIds.length ? await db.from('feed_posts').select(feedSelect).eq('event_id', event.id).in('id', missingIds) : { data: [], error: null };
  databaseError(reported.error);
  const enriched = await enrichFeedPosts(db, event.id, [...(posts.data ?? []).slice(0,50), ...(reported.data ?? [])]);
  return json({ posts: enriched.slice(0, Math.min(posts.data?.length ?? 0,50)), reportedPosts: enriched.slice(Math.min(posts.data?.length ?? 0,50)), reports: reports.data, hasMore: (posts.data?.length ?? 0) > 50 });
});
export const PATCH = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ postId: z.uuid(), status: z.enum(['visible','hidden','deleted']), reportId: z.uuid().nullable().default(null), reportStatus: z.enum(['reviewed','dismissed']).default('reviewed') }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.rpc('moderate_feed_post', { p_event: event.id, p_post: body.postId, p_status: body.status, p_report: body.reportId, p_report_status: body.reportStatus });
  databaseError(result.error); return json({ saved: true });
});
