"use client";
import { useState } from 'react';
import type { FeedReply } from '@/lib/types';
import { useResource } from '@/lib/hooks';
import { mutate, errorMessage } from '@/lib/client';
import { useApp } from './app-provider';
import { Busy, EmptyState, ErrorState } from './ui';
type Report = { id: string; reply_id: string; reason: string; status: string };
export function AdminFeedReplies() {
  const { notify } = useApp();
  const [offset, setOffset] = useState(0), [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useResource<{ replies: FeedReply[]; reportedReplies: FeedReply[]; reports: Report[]; hasMore: boolean }>('/api/admin/feed/replies?offset=' + offset);
  const moderate = async (replyId: string, status: string, reportId: string | null = null, reportStatus = 'reviewed') => {
    setBusy(true); try { await mutate('/api/admin/feed/replies', 'PATCH', { replyId, status, reportId, reportStatus }); await refresh(); notify('Reply moderation saved.'); } catch (failure) { notify(errorMessage(failure), true); } finally { setBusy(false); }
  };
  return <section className="wall-reply-moderation" aria-label="Reply moderation"><h2>Reply moderation</h2><p className="fine-print">Hiding a post also hides its replies from attendees. Restoring a reply does not restore a hidden parent post.</p>{error && <ErrorState message={error} retry={() => void refresh()} />}{loading ? <Busy /> : <>
    {(data?.reports ?? []).map(report => { const reply = [...(data?.replies ?? []), ...(data?.reportedReplies ?? [])].find(item => item.id === report.reply_id); return <article className="report-card" key={report.id}><span className="draft-badge">Open reply report</span><h3>{reply?.author_name ?? 'Event attendee'}</h3><p className="wall-body">{reply?.body ?? 'Reply unavailable'}</p><p><strong>Report:</strong> {report.reason}</p><div className="wall-actions"><button className="button button-red" disabled={busy} onClick={() => void moderate(report.reply_id, 'hidden', report.id)}>Hide reply & resolve</button><button className="button button-outline" disabled={busy} onClick={() => void moderate(report.reply_id, reply?.status ?? 'hidden', report.id, 'dismissed')}>Dismiss reply report</button></div></article>; })}
    {!data?.replies?.length && <EmptyState title="No replies yet." />}
    {(data?.replies ?? []).map(reply => <article className="report-card" key={reply.id}><span className={reply.status === 'visible' ? 'published-badge' : 'draft-badge'}>{reply.status}</span><h3>{reply.author_name}</h3><p className="wall-body">{reply.body}</p><button className="button button-outline" disabled={busy} onClick={() => void moderate(reply.id, reply.status === 'visible' ? 'hidden' : 'visible')}>{reply.status === 'visible' ? 'Hide reply' : 'Restore reply'}</button></article>)}
    {(offset > 0 || data?.hasMore) && <div className="pagination"><button className="button button-outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset-50))}>Previous replies</button><button className="button button-outline" disabled={!data?.hasMore} onClick={() => setOffset(offset+50)}>Next replies</button></div>}
  </>}</section>;
}
