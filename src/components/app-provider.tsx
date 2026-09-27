"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, WifiOff, X } from "lucide-react";
import type { Guide, Me, SavedItems } from "@/lib/types";
import { demoMe } from "@/lib/demo";
import { errorMessage, mutate, request } from "@/lib/client";
import { browserSupabase } from "@/lib/supabase/browser";

function subscribeOnline(callback: () => void) { window.addEventListener("online", callback); window.addEventListener("offline", callback); return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); }; }
const onlineSnapshot = () => navigator.onLine;
const serverOnlineSnapshot = () => true;

interface AppContext {
  guide: Guide; me: Me | null; saved: SavedItems; online: boolean; meError: string;
  refreshMe: () => Promise<void>; refreshGuide: () => Promise<void>;
  toggleSave: (kind: "session" | "attendee", id: string) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
}
const Context = createContext<AppContext | null>(null);
export function useApp() { const value = useContext(Context); if (!value) throw new Error("Event context is missing"); return value; }
export function useNow() {
  const { guide } = useApp();
  const [now, setNow] = useState(() => Date.parse(guide.fetchedAt));
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, []);
  return now;
}
export function AppProvider({ initialGuide, children }: { initialGuide: Guide; children: ReactNode }) {
  const [guide, setGuide] = useState(initialGuide);
  const [me, setMe] = useState<Me | null>(initialGuide.mode === "demo" ? demoMe : null);
  const [meError, setMeError] = useState("");
  const [saved, setSaved] = useState<SavedItems>({ sessions: [], attendees: [] });
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const inflight = useRef(new Set<string>());
  const identityGeneration = useRef(0);
  const identityRequest = useRef<Promise<void> | null>(null);
  const online = useSyncExternalStore(subscribeOnline, onlineSnapshot, serverOnlineSnapshot);
  const router = useRouter();
  const pathname = usePathname();
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const refreshMe = useCallback((): Promise<void> => {
    if (identityRequest.current) return identityRequest.current;
    const generation = identityGeneration.current;
    const pending = (async () => {
      try {
        const next = await request<Me>("/api/me");
        if (generation !== identityGeneration.current) return;
        setMe(next); setMeError("");
        if (next.eligible) {
          const nextSaved = await request<SavedItems>("/api/saved");
          if (generation === identityGeneration.current) setSaved(nextSaved);
        } else if (next.mode !== "demo") setSaved({ sessions: [], attendees: [] });
      } catch (error) { if (generation === identityGeneration.current) setMeError(errorMessage(error)); }
    })();
    identityRequest.current = pending;
    void pending.finally(() => { if (identityRequest.current === pending) identityRequest.current = null; });
    return pending;
  }, []);
  const organizerRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const refreshGuide = useCallback(async () => {
    try { const next = await request<Guide>(organizerRoute ? "/api/admin/guide" : "/api/guide"); setGuide(next); } catch { /* Existing public guide remains usable; offline banner reports connectivity. */ }
  }, [organizerRoute]);

  useEffect(() => {
    void refreshMe();
    if (initialGuide.mode === "demo") {
      Promise.resolve().then(() => {
        try {
          const value = JSON.parse(localStorage.getItem(`event-beast:demo:${initialGuide.event.id}:saved`) || "null");
          if (value && Array.isArray(value.sessions) && Array.isArray(value.attendees)) setSaved({ sessions: value.sessions.filter((s: unknown) => typeof s === "string"), attendees: value.attendees.filter((s: unknown) => typeof s === "string") });
        } catch { /* Storage may be disabled. The app still works. */ }
      });
    }
    const db = browserSupabase();
    const listener = db?.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") {
        identityGeneration.current += 1;
        identityRequest.current = null;
        setMe({ mode: "live", authenticated: false, eligible: false, isAdmin: false, attendeeId: null, profile: null, preferences: null });
        setSaved({ sessions: [], attendees: [] });
      }
      // Defer work until Supabase has released its auth callback lock.
      window.setTimeout(() => { void refreshMe(); }, 0);
    });
    return () => listener?.data.subscription.unsubscribe();
  }, [initialGuide.mode, initialGuide.event.id, refreshMe]);
  useEffect(() => {
    if (!online) return;
    const focus = () => { void refreshGuide(); void refreshMe(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshGuide(); }, 60000);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [online, refreshGuide, refreshMe]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((registration) => registration.active?.postMessage({ type: "REFRESH_PUBLIC_GUIDE" })).catch(() => { /* Install is optional. */ });
    }
    const viewport = window.visualViewport;
    const syncViewport = () => {
      document.documentElement.style.setProperty("--visual-height", `${viewport?.height ?? window.innerHeight}px`);
      document.body.dataset.keyboard = String(window.innerHeight - (viewport?.height ?? window.innerHeight) > 120);
    };
    syncViewport(); viewport?.addEventListener("resize", syncViewport);
    return () => viewport?.removeEventListener("resize", syncViewport);
  }, []);

  const toggleSave = useCallback(async (kind: "session" | "attendee", id: string) => {
    const key = `${kind}:${id}`;
    if (inflight.current.has(key)) return;
    if (guide.mode !== "demo" && !me?.eligible) { router.push(me?.authenticated ? "/access" : `/auth?next=${encodeURIComponent(pathname)}`); return; }
    const column = kind === "session" ? "sessions" : "attendees";
    const desired = !saved[column].includes(id);
    inflight.current.add(key);
    try {
      if (guide.mode !== "demo") await mutate("/api/saved", "PUT", { kind, target: id, saved: desired });
      setSaved((previous) => {
        const next = { ...previous, [column]: desired ? [...new Set([...previous[column], id])] : previous[column].filter((v) => v !== id) };
        if (guide.mode === "demo") { try { localStorage.setItem(`event-beast:demo:${guide.event.id}:saved`, JSON.stringify(next)); } catch { /* In-memory save remains useful. */ } }
        return next;
      });
      notify(desired ? guide.mode === "demo" ? "Saved on this device for your demo." : kind === "session" ? "Added to your saved sessions." : "Attendee saved." : "Removed from your saved items.");
    } catch (error) { notify(errorMessage(error), true); }
    finally { inflight.current.delete(key); }
  }, [guide.mode, guide.event.id, me, notify, pathname, router, saved]);

  return <Context.Provider value={{ guide, me, saved, online, meError, refreshMe, refreshGuide, toggleSave, notify }}>
    {!online && <div className="offline-banner" role="status"><WifiOff size={16} /><span>You’re offline. Previously loaded event essentials are available.</span><a href="/offline.html">Open guide</a></div>}
    {children}
    {toast && <div className={`toast${toast.error ? " toast-error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={18} /></button></div>}
  </Context.Provider>;
}
