"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useApp } from './app-provider';
import { useInboxSignal } from './realtime';
import { request, RequestError } from '@/lib/client';
import { EMPTY_ATTENTION, messageCountLabel, newerMessageId, shouldShowMessageNotice, type MessageAttention } from '@/lib/message-attention';

const AttentionContext = createContext<MessageAttention>(EMPTY_ATTENTION);
export const useMessageAttention = () => useContext(AttentionContext);
export function MessageAttentionProvider({ children }: { children: ReactNode }) {
  const { me, guide, online } = useApp();
  const pathname = usePathname();
  const key = me?.eligible && guide.communityEnabled && guide.settings.messaging_enabled && guide.mode === 'live' ? `${guide.event.id}:${me.attendeeId}` : null;
  const [state, setState] = useState<{ key: string; data: MessageAttention } | null>(null);
  const [notice, setNotice] = useState<{ key: string; conversation: string } | null>(null);
  const prior = useRef<{ key: string; data: MessageAttention } | null>(null);
  const generation = useRef(0), busy = useRef(false), again = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);
  const refresh = useCallback(async function loadAttention() {
    if (!key || !online || document.visibilityState !== 'visible') return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    const current = generation.current;
    try {
      const data = await request<MessageAttention>('/api/inbox/unread');
      if (current !== generation.current) return;
      const previous = prior.current?.key === key ? prior.current.data : null;
      if (shouldShowMessageNotice(data, previous, path.current)) setNotice({ key, conversation: data.conversationId! });
      // Keep a high-watermark through reads, so a late response cannot announce
      // an older unread thread as a newly received message.
      const latestId = !previous?.latestId || newerMessageId(data.latestId, previous.latestId) ? data.latestId : previous.latestId;
      prior.current = { key, data: { ...data, latestId } };
      setState({ key, data });
    } catch (error) {
      if (current === generation.current && error instanceof RequestError && [401,403].includes(error.status)) {
        prior.current = null; setState(null); setNotice(null);
      }
    } finally {
      if (current === generation.current) {
        busy.current = false;
        if (again.current) { again.current = false; void loadAttention(); }
      }
    }
  }, [key, online]);
  useEffect(() => { invalidate(); busy.current = false; again.current = false; void refresh(); return invalidate; }, [refresh, invalidate]);
  useInboxSignal(refresh);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 8000); return () => clearTimeout(timer); }, [notice]);
  const data = key && state?.key === key ? state.data : EMPTY_ATTENTION;
  const showNotice = Boolean(key && notice?.key === key && data.unread > 0 && pathname !== '/inbox/' + notice?.conversation);
  return <AttentionContext.Provider value={data}>{children}
    <span className="sr-only" role="status" aria-live="polite">{data.unread > 0 ? `You have ${messageCountLabel(data.unread)}.` : ''}</span>
    {showNotice && <aside className="message-arrival" aria-label="New private message"><MessageCircle size={20} aria-hidden="true" /><div><strong>New private message</strong><Link href={'/inbox/' + notice!.conversation} onClick={() => setNotice(null)}>Open conversation</Link></div><button type="button" aria-label="Dismiss message notice" onClick={() => setNotice(null)}><X size={19} /></button></aside>}
  </AttentionContext.Provider>;
}

export function MessageCount({ count }: { count: number }) {
  return count > 0 ? <span className="message-count" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null;
}
