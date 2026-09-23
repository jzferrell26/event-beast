"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ArrowUpRight, Check, CheckCheck, Clock3, MessageCircle, Send, ShieldCheck, RefreshCw, MoreHorizontal, X } from "lucide-react";
import type { ConversationSummary, Message, PendingMessage } from "@/lib/types";
import { errorMessage, mutate, request, RequestError } from "@/lib/client";
import { eventTime } from "@/lib/format";
import { ingestMessageBatch, unconfirmedMessages, type MessageTimeline } from "@/lib/message-state";
import { useApp } from "./app-provider";
import { Avatar, Busy, EmptyState, ErrorState, LoadingCards, PageTitle } from "./ui";
import { useInboxSignal } from "./realtime";
import { ModerationActions } from "./moderation";

export function InboxScreen() {
  const { guide } = useApp();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async (offset = 0) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const data = await request<{ conversations: ConversationSummary[]; hasMore: boolean }>(`/api/inbox?offset=${offset}`);
      if (!mounted.current) return;
      setConversations((previous) => {
        if (offset > 0) return [...previous, ...data.conversations.filter((c) => !previous.some((p) => p.id === c.id))];
        const ids = new Set(data.conversations.map((c) => c.id));
        return [...data.conversations, ...previous.slice(30).filter((c) => !ids.has(c.id))];
      });
      setHasMore(data.hasMore); setError("");
    } catch (error) {
      if (!mounted.current) return;
      setError(errorMessage(error));
      if (error instanceof RequestError && [401, 403].includes(error.status)) setConversations([]);
    } finally { busy.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const connection = useInboxSignal(() => void load());
  return <><PageTitle eyebrow="GOOD CONVERSATIONS CONTINUE HERE" title="Keep in touch." description="A quieter place to turn a hello into a connection." action={<Link href="/people" className="button button-outline button-small" aria-label="New message"><MessageCircle size={17} /><span>New message</span></Link>} /><div className="inbox-caption"><span><ShieldCheck size={15} />Private, one-to-one conversations</span><span className={`connection-state state-${connection}`}>{connection === "demo" ? "Sample conversations" : connection === "offline" ? "Offline" : connection === "connected" ? "Connected" : "Syncing when connected"}</span></div>
    {guide.mode === "demo" && <p className="demo-notice">These conversations are examples. No messages are sent to real attendees.</p>}
    {error && <ErrorState message={error} retry={() => void load()} />}
    {loading ? <LoadingCards count={3} /> : conversations.length ? <div className="conversation-list">{conversations.map((conversation) => <Link href={`/inbox/${conversation.id}`} key={conversation.id} className={`conversation-row${Number(conversation.unread_count) > 0 ? " unread" : ""}`}><Avatar name={conversation.peer_name} src={conversation.avatar_url} /><div className="conversation-copy"><div><h2>{conversation.peer_name}</h2><time dateTime={conversation.updated_at}>{eventTime(conversation.updated_at, guide.event.timezone)}</time></div><p>{conversation.blocked_by_me ? "You blocked this attendee" : conversation.last_message ?? "Say hello and start the conversation."}</p><span>{conversation.peer_company || "Event attendee"}</span></div>{Number(conversation.unread_count) > 0 && <span className="unread-badge" aria-label={`${conversation.unread_count} unread messages`}>{Number(conversation.unread_count) > 99 ? "99+" : conversation.unread_count}</span>}</Link>)}</div> : !error && <EmptyState title="Every connection starts with hello." icon={<MessageCircle size={30} />} action={<Link href="/people" className="button button-dark">Find your people<ArrowUpRight size={17} /></Link>}>Visit the directory to start a private conversation with another attendee.</EmptyState>}
    {hasMore && <button type="button" className="button button-outline load-more" onClick={() => void load(conversations.length)}>Older conversations</button>}
  </>;
}

interface ThreadResponse { messages: Message[]; hasMore: boolean; peer: { id: string; name: string }; blockedByMe: boolean; peerReadId: number }

export function ThreadScreen({ id }: { id: string }) {
  const { guide, me, online, notify } = useApp();
  const ownId = guide.mode === "demo" ? "demo-self" : me?.attendeeId ?? "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [peer, setPeer] = useState<ThreadResponse["peer"] | null>(null);
  const [peerReadId, setPeerReadId] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<number | undefined>();
  const [newBelow, setNewBelow] = useState(false);
  const [sending, setSending] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const records = useRef<MessageTimeline>({ messages: [], cursor: 0 });
  const initialized = useRef(false);
  const fetching = useRef(false);
  const rerun = useRef(false);
  const mounted = useRef(true);
  const atBottom = useRef(true);
  const lastRead = useRef(0);
  const marking = useRef(false);
  const sendingKeys = useRef(new Set<string>());

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => { if (scroll.current) { scroll.current.scrollTop = scroll.current.scrollHeight; atBottom.current = true; setNewBelow(false); } });
  }, []);
  const markRead = useCallback(async () => {
    const newest = records.current.cursor;
    if (guide.mode === "demo" || !newest || newest <= lastRead.current || marking.current || !atBottom.current || document.visibilityState !== "visible") return;
    marking.current = true;
    try { await mutate(`/api/inbox/${id}`, "PATCH", { lastReadId: newest }); lastRead.current = newest; }
    catch { /* A later read/reconnect retries; never invent read receipts. */ }
    finally { marking.current = false; }
  }, [guide.mode, id]);
  const accept = useCallback((incoming: Message[], source: "catchup" | "send" | "history" = "catchup") => {
    records.current = ingestMessageBatch(records.current, incoming, source);
    setMessages(records.current.messages);
    setPending((previous) => unconfirmedMessages(previous, records.current.messages, ownId));
    return records.current.messages;
  }, [ownId]);

  const reconcile = useCallback(async () => {
    if (fetching.current) { rerun.current = true; return; }
    fetching.current = true;
    try {
      let pages = 0, more = false;
      do {
        const cursor = initialized.current ? records.current.cursor : undefined;
        const data = await request<ThreadResponse>(`/api/inbox/${id}${cursor !== undefined ? `?after=${cursor}` : ""}`);
        if (!mounted.current) return;
        setPeer(data.peer); setPeerReadId(Number(data.peerReadId)); setBlocked(data.blockedByMe);
        if (!initialized.current) setHasOlder(data.hasMore);
        const previousLast = records.current.messages.at(-1)?.id;
        const next = accept(data.messages);
        if (!initialized.current || atBottom.current) scrollToBottom();
        else if ((next.at(-1)?.id ?? 0) > (previousLast ?? 0)) setNewBelow(true);
        more = cursor !== undefined && data.hasMore;
        initialized.current = true;
        pages += 1;
      } while (more && pages < 10);
      if (more) rerun.current = true;
      setError("");
      void markRead();
    } catch (error) {
      if (!mounted.current) return;
      setError(errorMessage(error));
      if (error instanceof RequestError && [401, 403, 404].includes(error.status)) { records.current = { messages: [], cursor: 0 }; initialized.current = false; lastRead.current = 0; setMessages([]); setPending([]); setPeer(null); }
    } finally {
      fetching.current = false;
      if (mounted.current) {
        setLoading(false);
        if (rerun.current) { rerun.current = false; window.setTimeout(() => void reconcile(), 150); }
      }
    }
  }, [accept, id, markRead, scrollToBottom]);
  useEffect(() => { mounted.current = true; void reconcile(); return () => { mounted.current = false; }; }, [reconcile]);
  const connection = useInboxSignal(() => void reconcile());

  const loadOlder = async () => {
    const oldest = records.current.messages[0]?.id;
    if (!oldest || olderLoading) return;
    setOlderLoading(true);
    const oldHeight = scroll.current?.scrollHeight ?? 0;
    const oldTop = scroll.current?.scrollTop ?? 0;
    try {
      const data = await request<ThreadResponse>(`/api/inbox/${id}?before=${oldest}`);
      if (!mounted.current) return;
      accept(data.messages, "history"); setHasOlder(data.hasMore);
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = oldTop + scroll.current.scrollHeight - oldHeight; });
    } catch (error) { notify(errorMessage(error), true); }
    finally { if (mounted.current) setOlderLoading(false); }
  };
  const deliver = async (item: PendingMessage) => {
    if (sendingKeys.current.has(item.client_id)) return;
    sendingKeys.current.add(item.client_id); setSending(true);
    setPending((previous) => [...previous.filter((p) => p.client_id !== item.client_id), { ...item, status: "pending", error: undefined }]);
    scrollToBottom();
    try {
      const data = await mutate<{ message: Message }>(`/api/inbox/${id}`, "POST", { client_id: item.client_id, body: item.body });
      if (!mounted.current) return;
      accept([data.message], "send"); scrollToBottom(); void reconcile();
    } catch (error) {
      if (mounted.current) setPending((previous) => previous.map((p) => p.client_id === item.client_id ? { ...p, status: "failed", error: errorMessage(error) } : p));
    } finally { sendingKeys.current.delete(item.client_id); if (mounted.current) setSending(sendingKeys.current.size > 0); }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (guide.mode === "demo" || !online || blocked || !body || body.length > 4000 || sending) return;
    const item: PendingMessage = { client_id: crypto.randomUUID(), body, created_at: new Date().toISOString(), status: "pending" };
    setDraft("");
    if (textarea.current) textarea.current.style.height = "auto";
    void deliver(item);
  };
  const disabled = guide.mode === "demo" || blocked || !online || !peer || Boolean(error && messages.length === 0);
  return <section className="thread-screen"><header className="thread-header"><Link href="/inbox" className="icon-button" aria-label="Back to inbox"><ArrowLeft size={21} /></Link>{peer && <Avatar name={peer.name} />}<div className="thread-person"><h1>{peer?.name ?? "Your conversation"}</h1><span>{connection === "demo" ? "Sample conversation · read-only" : blocked ? "Attendee blocked" : connection === "offline" ? "Offline · messages are not being sent" : connection === "connected" ? "Private conversation" : "Reconnecting · history is saved"}</span></div>{peer && <button type="button" className="icon-button" aria-label="Conversation options" aria-expanded={showTools} onClick={() => setShowTools((value) => !value)}>{showTools ? <X size={20} /> : <MoreHorizontal size={21} />}</button>}</header>
    {showTools && peer && <div className="thread-tools"><Link href={`/people/${peer.id}`} className="text-button">View attendee<ArrowUpRight size={14} /></Link><ModerationActions target={peer.id} blocked={blocked} messageId={reportMessageId} onChange={() => { setShowTools(false); setReportMessageId(undefined); void reconcile(); }} /></div>}
    <div className="thread-messages" ref={scroll} onScroll={() => { const el = scroll.current; if (!el) return; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; if (atBottom.current) { setNewBelow(false); void markRead(); } }}>
      <p className="thread-privacy"><ShieldCheck size={13} />Only you and this attendee can read this conversation. Reported messages can be reviewed by the event team.</p>
      {loading ? <LoadingCards count={3} /> : <>{hasOlder && <button type="button" className="text-button thread-older" disabled={olderLoading} onClick={() => void loadOlder()}>{olderLoading ? <Busy label="Loading earlier messages…" /> : "Earlier messages"}</button>}{!messages.length && !error && <div className="thread-welcome"><MessageCircle size={30} /><h2>Start with a hello.</h2><p>A shared session or interest is a great place to begin.</p></div>}{messages.map((message, index) => {
        const own = message.sender_id === ownId;
        const previousDate = index ? new Date(messages[index - 1].created_at).toLocaleDateString("en-US", { timeZone: guide.event.timezone }) : null;
        const date = new Date(message.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: guide.event.timezone });
        const showDate = !previousDate || previousDate !== new Date(message.created_at).toLocaleDateString("en-US", { timeZone: guide.event.timezone });…5304 tokens truncated… === "demo") { notify("This is a sample attendee. Explore the example conversations in Inbox."); router.push("/inbox"); return; }
    if (!me?.profile?.messaging_available) { notify("Turn on messaging in My Profile to start a conversation."); router.push("/more/profile"); return; }
    setBusy(true);
    try { const result = await mutate<{ id: string }>("/api/inbox", "POST", { recipient: id }); router.push(`/inbox/${result.id}`); }
    catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); }
  };
  if (error) return <ErrorState message={error} retry={() => void refresh()} />;
  if (loading || !data) return <LoadingCards />;
  const p = data.profile;
  const selected = saved.attendees.includes(id);
  const own = me?.attendeeId === id;
  const website = httpsUrl(p.website);
  return <div className="profile-detail"><Link href="/people" className="back-link"><ArrowLeft size={17} />Back to people</Link><section className="profile-hero"><div className="profile-cover"><span className="eyebrow">A LITTLE MORE MOMENTUM</span></div><div className="profile-summary"><Avatar name={p.full_name} src={p.avatar_url} large /><h1>{p.full_name}</h1><p>{p.title}{p.company && <> at <strong>{p.company}</strong></>}</p>{(p.city || p.state) && <span className="person-city"><MapPin size={14} />{[p.city, p.state].filter(Boolean).join(", ")}</span>}<div className="profile-actions">{own ? <Link href="/more/profile" className="button button-dark">Edit my profile</Link> : <><button className="button button-red" type="button" disabled={busy || !p.messaging_available} onClick={() => void beginConversation()}>{busy ? <Busy label="Opening…" /> : <><MessageCircle size={18} />{p.messaging_available ? "Start a conversation" : "Messaging unavailable"}</>}</button><button type="button" className="button button-outline" aria-pressed={selected} onClick={() => void toggleSave("attendee", id)}><Bookmark size={18} fill={selected ? "currentColor" : "none"} />{selected ? "Saved" : "Save"}</button></>}</div></div></section><section className="detail-section"><h2>A little about me</h2><p>{p.bio || "This attendee has not added an introduction yet."}</p></section>{p.interests.length > 0 && <section className="detail-section"><h2>Let’s talk about</h2><div className="profile-interests">{p.interests.map((interest) => <span key={interest}>{interest}</span>)}</div></section>}{(p.public_email || p.public_phone || website) && <section className="detail-section"><h2>Ways to connect</h2><div className="contact-links">{p.public_email && <a href={`mailto:${encodeURIComponent(p.public_email)}`}><Mail size={17} />{p.public_email}</a>}{p.public_phone && <a href={`tel:${p.public_phone.replace(/[^+0-9]/g, "")}`}><Phone size={17} />{p.public_phone}</a>}{website && <a href={website} target="_blank" rel="noopener noreferrer"><Globe size={17} />Visit website<ArrowUpRight size={15} /></a>}</div><p className="fine-print">Shared by this attendee, by choice.</p></section>}{!own && <ModerationActions target={id} onChange={() => router.push("/people")} />}</div>;
}
