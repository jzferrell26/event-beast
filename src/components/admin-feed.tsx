"use client";
import { useState } from 'react';
import type { FeedPost } from '@/lib/types';
import { useResource } from '@/lib/hooks';
import { mutate, errorMessage } from '@/lib/client';
import { useApp } from './app-provider';
import { Busy, EmptyState, ErrorState, PageTitle } from './ui';
import { FeedPhoto } from './feed-photo';
import { AdminFeedReplies } from './admin-feed-replies';
interface WallReport { id: string; post_id: string; reason: string; status: string }
export function AdminFeed() {
  const { notify } = useApp();
  const [offset, setOffset] = useState(0), [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useResource<{ posts: FeedPost[]; reportedPosts: FeedPost[]; reports: WallReport[]; hasMore: boolean }>('/api/admin/feed?offset=' + offset);
  const moderate = async (postId: string, status: string, reportId: string | null = null, reportStatus = 'reviewed') => {
    setBusy(true); try { await mutate('/api/admin/feed', 'PATCH', { postId, status, reportId, reportStatus }); await refresh(); notify('Moderation saved.'); } catch (failure) { notify(errorMessage(failure), true); } finally { setBusy(false); }
  };
  return <><PageTitle eyebrow="KEEP THE CONVERSATION WELCOMING" title="Social wall moderation" description="Review public-to-attendees posts and reports. Private messages are not included." />{error && <ErrorState message={error} retry={() => void refresh()} />}{loading ? <Busy /> : <>
    {(data?.reports ?? []).map(report => { const post = [...(data?.posts ?? []), ...(data?.reportedPosts ?? [])].find(item => item.id === report.post_id); return <article className="report-card" key={report.id}><span className="draft-badge">Open report</span><h2>{post?.author_name ?? 'Event attendee'}</h2><p className="wall-body">{post?.body ?? 'Post unavailable'}</p><FeedPhoto src={post?.image_url} author={post?.author_name} /><p><strong>Report:</strong> {report.reason}</p><div className="wall-actions"><button className="button button-red" disabled={busy} onClick={() => void moderate(report.post_id, 'hidden', report.id)}>Hide & resolve</button><button className="button button-outline" disabled={busy} onClick={() => void moderate(report.post_id, post?.status ?? 'hidden', report.id, 'dismissed')}>Dismiss report</button></div></article>; })}
    {!data?.posts.length && <EmptyState title="No wall posts yet." />}
    {(data?.posts ?? []).map(post => <article className="report-card" key={post.id}><span className={post.status === 'visible' ? 'published-badge' : 'draft-badge'}>{post.status}</span><h2>{post.author_name}</h2><p className="wall-body">{post.body}</p><FeedPhoto src={post.image_url} author={post.author_name} /><button className="button button-outline" disabled={busy} onClick={() => void moderate(post.id, post.status === 'visible' ? 'hidden' : 'visible')}>{post.status === 'visible' ? 'Hide post' : 'Restore post'}</button></article>)}
    {(offset > 0 || data?.hasMore) && <div className="pagination"><button className="button button-outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0,offset - 50))}>Previous</button><button className="button button-outline" disabled={!data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</button></div>}
  </>}<AdminFeedReplies /></>;
}
