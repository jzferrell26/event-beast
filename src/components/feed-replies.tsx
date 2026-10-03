"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Flag, Send, RefreshCw } from 'lucide-react';
import type { FeedReply } from '@/lib/types';
import { errorMessage, mutate, request, RequestError } from '@/lib/client';
import { useApp } from './app-provider';
import { Avatar, Busy, ErrorState, Modal } from './ui';

type Page = { replies: FeedReply[]; nextCursor: string | null };
export function FeedReplies({ postId, onChanged }: { postId: string; onChanged: () => void }) {
  const { me, guide, notify } = useApp();
  const [replies, setReplies] = useState<FeedReply[]>([]), [draft, setDraft] = useState('');
  const [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState<FeedReply | null>(null), [editBody, setEditBody] = useState('');
  const [removing, setRemoving] = useState<FeedReply | null>(null), [reporting, setReporting] = useState<FeedReply | null>(null), [reason, setReason] = useState('');
  const requestId = useRef<{ clientId: string; body: string } | null>(null), generation = useRef(0), pageCount = useRef(1), sending = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async (after?: string) => {
    const current = ++generation.current; setLoading(true);
    try {
      const collected: FeedReply[] = []; let next: string | null = after ?? null;
      const count = after ? 1 : pageCount.current;
      for (let page = 0; page < count; page++) {
        const result: Page = await request(`/api/feed/${postId}/replies` + (next ? '?cursor=' + encodeURIComponent(next) : ''));
        collected.push(...result.replies); next = result.nextCursor;
        if (!next || current !== generation.current) break;
      }
      if (current !== generation.current) return;
      setReplies(prior => (after ? [...prior, ...collected.filter(reply => !prior.some(item => item.id === reply.id))] : collected).sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
      setCursor(next); setError(''); if (after) pageCount.current++;
    } catch (failure) {
      if (current === generation.current) { setError(errorMessage(failure)); if (failure instanceof RequestError && [401,403,404].includes(failure.status)) setReplies([]); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [postId]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible' && !sending.current) void load(); };
    const timer = window.setInterval(refresh, 30000); window.addEventListener('focus', refresh);
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, invalidate]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (sending.current || !draft.trim()) return;
    if (guide.mode === 'demo') { notify('This preview is read-only. Replies are not published.', true); return; }
    if (!requestId.current || requestId.current.body !== draft.trim()) requestId.current = { clientId: crypto.randomUUID(), body: draft.trim() };
    sending.current = true; setBusy(true); setError('');
    try { await mutate(`/api/feed/${postId}/replies`, 'POST', requestId.current); setDraft(''); requestId.current = null; await load(); onChanged(); notify('Your reply is posted.'); }
    catch (failure) { setError(errorMessage(failure) + ' Your reply draft is retained. Retry without creating a duplicate.'); }
    finally { sending.current = false; setBusy(false); }
  };
  const edit = async (reply: FeedReply, body: string, remove = false) => {
    setBusy(true); setActionError('');
    try { await mutate('/api/feed/replies/' + reply.id, 'PATCH', { version: reply.version, body, remove }); setEditing(null); setRemoving(null); await load(); onChanged(); }
    catch (failure) { setActionError(errorMessage(failure)); }
    finally { setBusy(false); }
  };
  const time = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: guide.event.timezone }).format(new Date(value));
  return <section className="wall-thread" aria-label="Replies to this post">
    <div className="wall-thread-heading"><h3>Replies</h3><button type="button" className="text-button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Refresh replies</button></div>
    {loading && !replies.length && <p role="status"><Busy label="Loading replies…" /></p>}
    {!loading && !error && !replies.length && <p className="fine-print">Start the conversation.</p>}
    {replies.map(reply => <article className="wall-reply" key={reply.id}><header><Avatar name={reply.author_name} src={reply.avatar_url} /><div><h4>{reply.author_name}</h4><time dateTime={reply.created_at}>{time(reply.created_at)}</time>{reply.version > 0 && <small> · Edited</small>}</div></header><p className="wall-reply-body">{reply.body}</p><div className="wall-reply-actions">{reply.author_id === me?.attendeeId ? <><button type="button" className="text-button" onClick={() => { setEditing(reply); setEditBody(reply.body); setActionError(''); }}>Edit reply</button><button type="button" className="text-button" onClick={() => { setRemoving(reply); setActionError(''); }}>Remove reply</button></> : <button type="button" className="text-button" onClick={() => { setReporting(reply); setReason(''); setActionError(''); }}><Flag size={14} />Report reply</button>}</div></article>)}
    {cursor && <button type="button" className="button button-outline button-small" disabled={loading} onClick={() => void load(cursor)}>Earlier replies</button>}
    {error && <ErrorState message={error} />}
    <form onSubmit={submit} className="wall-reply-form"><label className="form-field"><span>Write a reply</span><textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={2000} required disabled={busy} placeholder="Add to the conversation…" /></label><button type="submit" className="button button-red button-small" disabled={busy || !draft.trim()}>{busy ? <Busy label="Replying…" /> : <><Send size={15} />Post reply</>}</button></form>
    <Modal open={Boolean(editing)} onOpenChange={open => { if (!open && !busy) setEditing(null); }} title="Edit your reply"><form onSubmit={event => { event.preventDefault(); if (editing) void edit(editing, editBody); }}><label className="form-field"><span>Reply text</span><textarea value={editBody} onChange={event => setEditBody(event.target.value)} required maxLength={2000} rows={4} /></label>{actionError && <ErrorState message={actionError} />}<button className="button button-red" disabled={busy || !editBody.trim()}>Save reply</button></form></Modal>
    <Modal open={Boolean(removing)} onOpenChange={open => { if (!open && !busy) setRemoving(null); }} title="Remove your reply?" description="This reply will no longer appear in the conversation.">{actionError && <ErrorState message={actionError} />}<button type="button" className="button button-red" disabled={busy} onClick={() => { if (removing) void edit(removing, removing.body, true); }}>Remove reply</button></Modal>
    <Modal open={Boolean(reporting)} onOpenChange={open => { if (!open && !busy) setReporting(null); }} title="Report this reply" description="Only event organizers can see your report."><form onSubmit={async event => { event.preventDefault(); if (!reporting) return; setBusy(true); try { await mutate('/api/feed/replies/' + reporting.id, 'POST', { reason }); setReporting(null); notify('Reply reported to the organizer.'); } catch (failure) { setActionError(errorMessage(failure)); } finally { setBusy(false); } }}><label className="form-field"><span>Reason for reporting</span><textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>{actionError && <ErrorState message={actionError} />}<button className="button button-red" disabled={busy || reason.trim().length < 3}>Send report</button></form></Modal>
  </section>;
}
