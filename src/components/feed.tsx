"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Flag, MessageSquareText, RefreshCw, Send, Users } from 'lucide-react';
import type { FeedPost } from '@/lib/types';
import { mutate, request, errorMessage, RequestError } from '@/lib/client';
import { useApp } from './app-provider';
import { Avatar, Busy, EmptyState, ErrorState, Modal, PageTitle } from './ui';

export function FeedScreen() {
  const { me, guide, notify } = useApp();
  const [posts, setPosts] = useState<FeedPost[]>([]), [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeedPost | null>(null), [editBody, setEditBody] = useState('');
  const [report, setReport] = useState<FeedPost | null>(null), [reason, setReason] = useState('');
  const [removing, setRemoving] = useState<FeedPost | null>(null), [actionError, setActionError] = useState('');
  const send = useRef<{ clientId: string; body: string } | null>(null);
  const generation = useRef(0);
  const invalidateRequests = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async (after: string | null = null) => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await request<{ posts: FeedPost[]; nextCursor: string | null }>('/api/feed' + (after ? '?cursor=' + encodeURIComponent(after) : ''));
      if (current !== generation.current) return;
      setPosts(previous => after ? [...previous, ...result.posts.filter(post => !previous.some(item => item.id === post.id))] : result.posts);
      setCursor(result.nextCursor); setError('');
    } catch (failure) { if (current === generation.current) { setError(errorMessage(failure)); if (failure instanceof RequestError && [401,403].includes(failure.status)) setPosts([]); } }
    finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { invalidateRequests(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, invalidateRequests]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.trim() || busy) return;
    if (guide.mode === 'demo') { notify('This preview is read-only. Posts are not published.', true); return; }
    if (!send.current || send.current.body !== draft.trim()) send.current = { clientId: crypto.randomUUID(), body: draft.trim() };
    setBusy(true);
    try { await mutate('/api/feed', 'POST', send.current); setDraft(''); send.current = null; await load(); notify('Your post is on the social wall.'); }
    catch (failure) { notify(errorMessage(failure) + ' Your draft is retained; retrying the same draft will not create a duplicate.', true); }
    finally { setBusy(false); }
  };
  const updatePost = async (post: FeedPost, body: string, remove = false) => {
    setBusy(true); setActionError('');
    try { await mutate('/api/feed/' + post.id, 'PATCH', { version: post.version, body, remove }); setEditing(null); setRemoving(null); await load(); }
    catch (failure) { setActionError(errorMessage(failure)); }
    finally { setBusy(false); }
  };
  return <><PageTitle eyebrow="THE CONVERSATION BETWEEN SESSIONS" title="The social wall." description="A shared space for event attendees. Introduce yourself, share a takeaway or start a conversation." action={<button type="button" className="button button-outline" disabled={loading} onClick={() => void load()}><RefreshCw size={16} />Refresh</button>} />
    <div className="wall-shortcuts"><Link href="/people"><Users size={19} />Meet attendees<ArrowRight size={16} /></Link><Link href="/inbox"><MessageSquareText size={19} />Private messages<ArrowRight size={16} /></Link></div>
    <form className="wall-composer" onSubmit={submit}><label className="form-field"><span>Share with the event</span><textarea maxLength={2000} rows={4} value={draft} onChange={event => setDraft(event.target.value)} placeholder="What’s worth sharing?" /></label><div className="wall-composer-footer"><p>Your profile name and post will be visible to verified event attendees. Keep private information in your one-to-one messages.</p><button type="submit" className="button button-red" disabled={busy || !draft.trim()}>{busy ? <Busy label="Posting…" /> : <><Send size={16} />Post</>}</button></div></form>
    {error && <ErrorState message={error} retry={() => void load()} />}
    {loading && !posts.length ? <Busy label="Loading the social wall…" /> : !error && !posts.length ? <EmptyState title="Be the first to get it moving." icon={<MessageSquareText size={28} />}>Share an introduction or a takeaway. Private messages stay in Inbox, never on this wall.</EmptyState> : <div className="wall-posts">{posts.map(post => <article className="wall-post" key={post.id}><header><Avatar name={post.author_name || 'Event attendee'} src={post.avatar_url} /><div><h2>{post.author_name || 'Event attendee'}</h2><time dateTime={post.created_at}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: guide.event.timezone }).format(new Date(post.created_at))}</time>{post.version > 0 && <small> · Edited</small>}</div></header><p className="wall-body">{post.body}</p><footer>{post.author_id === me?.attendeeId ? <><button type="button" className="text-button" onClick={() => { setEditing(post); setEditBody(post.body); setActionError(''); }}>Edit</button><button type="button" className="text-button" onClick={() => { setRemoving(post); setActionError(''); }}>Remove</button></> : <button type="button" className="text-button" onClick={() => { setReport(post); setReason(''); setActionError(''); }}><Flag size={14} />Report</button>}{me?.isAdmin && <Link href="/admin/feed" className="text-button">Moderate wall</Link>}</footer></article>)}</div>}
    {cursor && <button type="button" className="button button-outline load-more" disabled={loading} onClick={() => void load(cursor)}>Older posts</button>}
    <Modal open={Boolean(editing)} onOpenChange={open => { if (!open && !busy) setEditing(null); }} title="Edit your post" description="Only your post text changes. Moderation decisions cannot be undone here."><form onSubmit={event => { event.preventDefault(); if (editing) void updatePost(editing, editBody); }}><label className="form-field"><span>Post text</span><textarea required maxLength={2000} rows={5} value={editBody} onChange={event => setEditBody(event.target.value)} /></label>{actionError && <ErrorState message={actionError} />}<button className="button button-red" disabled={busy || !editBody.trim()}>Save post</button></form></Modal>
    <Modal open={Boolean(removing)} onOpenChange={open => { if (!open && !busy) setRemoving(null); }} title="Remove your post?" description="It will no longer appear on the event wall.">{actionError && <ErrorState message={actionError} />}<button type="button" className="button button-red" disabled={busy} onClick={() => { if (removing) void updatePost(removing, removing.body, true); }}>Remove post</button></Modal>
    <Modal open={Boolean(report)} onOpenChange={open => { if (!open && !busy) setReport(null); }} title="Report this post" description="Only the organizer can see your report."><form onSubmit={async event => { event.preventDefault(); if (!report) return; setBusy(true); try { await mutate('/api/feed/' + report.id, 'POST', { reason }); setReport(null); notify('Report sent to the organizer.'); } catch (failure) { setActionError(errorMessage(failure)); } finally { setBusy(false); } }}><label className="form-field"><span>Reason for reporting</span><textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>{actionError && <ErrorState message={actionError} />}<button className="button button-red" disabled={busy || reason.trim().length < 3}>Send report</button></form></Modal>
  </>;
}
