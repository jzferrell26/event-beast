import { z } from 'zod';
import { requireMember } from '@/lib/server/auth';
import { ApiError, databaseError, handle } from '@/lib/server/http';
import { requireOpenWall } from '@/lib/server/feed';
import { normalizeFeedPhoto } from '@/lib/server/feed-photo';
import { photoSlot } from '@/lib/feed';
import { cachedFeedPhoto } from '@/lib/server/photo-work';

export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const id = z.uuid().parse((await context.params).id);
  const slot = photoSlot.parse(Number(new URL(request.url).searchParams.get('slot') ?? 1));
  const { db, event, isAdmin } = await requireMember();
  if (!isAdmin) await requireOpenWall(db, event.id);
  const post = await db.from('feed_posts').select('image_path,status,photo_count').eq('event_id', event.id).eq('id', id).maybeSingle();
  databaseError(post.error);
  if (!post.data?.image_path || slot > (post.data.photo_count ?? 1) || (!isAdmin && post.data.status !== 'visible')) throw new ApiError(404, 'Photo unavailable.');
  const path = slot === 1 ? post.data.image_path : post.data.image_path.replace(/\.webp$/, `-${slot}.webp`);
  // Membership, wall flags and post RLS were checked BEFORE this process cache.
  const bytes = await cachedFeedPhoto(path, async () => {
    const result = await db.storage.from('event-feed-photos').download(path);
    if (result.error || !result.data) throw new ApiError(404, 'Photo unavailable.');
    return normalizeFeedPhoto(new Uint8Array(await result.data.arrayBuffer()));
  });
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' } });
});
