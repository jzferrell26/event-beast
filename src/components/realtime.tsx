"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { useApp } from "./app-provider";

// Broadcast is an invalidation signal. Every update is authorized and re-read
// from Postgres. Polling/focus/online reconciliation covers lost broadcasts.
function useDirectInboxSignal(onChange: () => void, enabled = true) {
  const { guide, me, online } = useApp();
  const [connectedTo, setConnectedTo] = useState<string | null>(null);
  const connectionKey = me?.eligible && me.attendeeId ? `${guide.event.id}:${me.attendeeId}` : null;
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (navigator.onLine && document.visibilityState === "visible") callback.current(); };
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 20000);
    window.addEventListener('event-beast:inbox-changed', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener('event-beast:inbox-changed', refresh); };
  }, [enabled]);
  useEffect(() => {
    const db = browserSupabase();
    if (!enabled || !db || !me?.eligible || !me.attendeeId || guide.mode === "demo") return;
    let disposed = false;
    let channel: ReturnType<typeof db.channel> | undefined;
    const connect = async () => {
      const { data } = await db.auth.getSession();
      if (disposed || !data.session) return;
      await db.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel = db.channel(`event:${guide.event.id}:attendee:${me.attendeeId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => { if (!disposed && document.visibilityState === "visible") callback.current(); })
        .subscribe((status: string) => {
          if (disposed) return;
          setConnectedTo(status === "SUBSCRIBED" ? connectionKey : null);
          if (status === "SUBSCRIBED") callback.current();
        });
    };
    void connect().catch(() => { if (!disposed) setConnectedTo(null); });
    return () => { disposed = true; if (channel) void db.removeChannel(channel); };
  }, [guide.event.id, guide.mode, me?.attendeeId, me?.eligible, enabled, connectionKey]);
  return !online ? "offline" : guide.mode === "demo" ? "demo" : connectionKey && connectedTo === connectionKey ? "connected" : "reconnecting";
}

type Signal = { connection: ReturnType<typeof useDirectInboxSignal>; subscribe: (callback: () => void) => () => void };
const InboxSignalContext = createContext<Signal | null>(null);

/** One private Realtime channel per app shell, shared by the global badge and
 * mounted inbox/thread. Separate subscriptions must not tear each other down. */
export function InboxSignalProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<() => void>());
  const emit = useCallback(() => { for (const callback of listeners.current) callback(); }, []);
  const subscribe = useCallback((callback: () => void) => { listeners.current.add(callback); return () => { listeners.current.delete(callback); }; }, []);
  const connection = useDirectInboxSignal(emit);
  const value = useMemo<Signal>(() => ({ connection, subscribe }), [connection, subscribe]);
  return <InboxSignalContext.Provider value={value}>{children}</InboxSignalContext.Provider>;
}
export function useInboxSignal(onChange: () => void) {
  const shared = useContext(InboxSignalContext);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => shared?.subscribe(() => callback.current()), [shared]);
  const fallback = useDirectInboxSignal(onChange, shared === null);
  return shared?.connection ?? fallback;
}
export function invalidateInbox() { window.dispatchEvent(new Event('event-beast:inbox-changed')); }
