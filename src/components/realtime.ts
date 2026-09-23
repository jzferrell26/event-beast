"use client";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { useApp } from "./app-provider";

// Broadcast is an invalidation signal. Every update is authorized and re-read
// from Postgres. Polling/focus/online reconciliation covers lost broadcasts.
export function useInboxSignal(onChange: () => void) {
  const { guide, me, online } = useApp();
  const [connected, setConnected] = useState(false);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const refresh = () => { if (navigator.onLine && document.visibilityState === "visible") callback.current(); };
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 20000);
    return () => { window.clearInterval(interval); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    const db = browserSupabase();
    if (!db || !me?.eligible || !me.attendeeId || guide.mode === "demo") return;
    let disposed = false;
    let channel: ReturnType<typeof db.channel> | undefined;
    const connect = async () => {
      const { data } = await db.auth.getSession();
      if (disposed || !data.session) return;
      await db.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel = db.channel(`event:${guide.event.id}:attendee:${me.attendeeId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => { if (!disposed && document.visibilityState === "visible") callback.current(); })
        .subscribe((status) => {
          if (disposed) return;
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") callback.current();
        });
    };
    void connect().catch(() => { if (!disposed) setConnected(false); });
    return () => { disposed = true; if (channel) void db.removeChannel(channel); };
  }, [guide.event.id, guide.mode, me?.attendeeId, me?.eligible]);
  return !online ? "offline" : guide.mode === "demo" ? "demo" : connected ? "connected" : "reconnecting";
}
