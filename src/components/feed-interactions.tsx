"use client";
import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import type { FeedPost } from '@/lib/types';
import { errorMessage, mutate } from '@/lib/client';
import { useApp } from './app-provider';
import { FeedReplies } from './feed-replies';

export function FeedInteractions({ post, onChanged }: { post: FeedPost; onChanged: () => void }) {
  const { guide, notify } = useApp();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(Boolean(post.liked_by_me)), [count, setCount] = useState(post.like_count ?? 0);
  const [retry, setRetry] = useState<boolean | null>(null), [error, setError] = useState('');
  const inflight = useRef(false);
  const retryState = useRef<boolean | null>(null);
  useEffect(() => { if (!inflight.current && retryState.current === null) { setLiked(Boolean(post.liked_by_me)); setCount(post.like_count ?? 0); } }, [post.liked_by_me, post.like_count]);
  const like = async () => {
    if (inflight.current) return;
    if (guide.mode === 'demo') { notify('This preview is read-only. Likes are not saved.', true); return; }
    const desired = retry ?? !liked; inflight.current = true; setBusy(true); setError('');
    try { const result = await mutate<{ like_count: number; liked_by_me: boolean }>(`/api/feed/${post.id}/like`, 'PUT', { liked: desired }); setLiked(result.liked_by_me); setCount(Number(result.like_count)); retryState.current = null; setRetry(null); onChanged(); }
    catch (failure) { retryState.current = desired; setRetry(desired); setError(errorMessage(failure) + ' Tap again to retry the same action.'); }
    finally { inflight.current = false; setBusy(false); }
  };
  return <><div className="wall-engagement"><button type="button" className={'wall-like' + (liked ? ' is-liked' : '')} aria-pressed={liked} disabled={busy} onClick={() => void like()}><Heart size={19} fill={liked ? 'currentColor' : 'none'} /><span>{retry !== null ? 'Retry ' + (retry ? 'like' : 'unlike') : liked ? 'Liked' : 'Like'}</span><span className="wall-count">{count}</span></button><button type="button" aria-expanded={open} aria-controls={'replies-' + post.id} onClick={() => setOpen(value => !value)}><MessageCircle size={19} /><span>Reply</span><span className="wall-count">{post.reply_count ?? 0}</span></button></div>{error && <p className="wall-inline-error" role="alert">{error}</p>}<div id={'replies-' + post.id}>{open && <FeedReplies postId={post.id} onChanged={onChanged} />}</div></>;
}
