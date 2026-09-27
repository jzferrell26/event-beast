"use client";
import Link from "next/link";
import { Bookmark, Clock3, MapPin, ArrowUpRight } from "lucide-react";
import type { AgendaSession, SponsorPlacement } from "@/lib/types";
import { eventTime, sessionSpeakers, sessionState } from "@/lib/format";
import { useApp, useNow } from "./app-provider";

export function SessionCard({ session, compact = false }: { session: AgendaSession; compact?: boolean }) {
  const { guide, saved, toggleSave } = useApp();
  const now = useNow();
  const current = sessionState(session, now) === "now";
  const speakers = sessionSpeakers(guide, session.id);
  const isSaved = saved.sessions.includes(session.id);
  return <article className={`session-card${current ? " session-live" : ""}${compact ? " compact" : ""}`}>
    {!compact && <div className="session-time"><strong>{eventTime(session.starts_at, guide.event.timezone).replace(/ [AP]M/, "")}</strong><span>{eventTime(session.starts_at, guide.event.timezone).slice(-2)}</span><span className="time-line" /></div>}
    <div className="session-body"><div className="session-meta"><span className={`type-pill type-${session.session_type.toLowerCase()}`}>{session.session_type}</span>{current && <span className="live-label"><span className="live-dot" />LIVE NOW</span>}</div>
      <Link href={`/agenda/${session.id}`} className="session-title"><h3>{session.title}</h3></Link>
      {compact && <p className="session-duration"><Clock3 size={14} />{eventTime(session.starts_at, guide.event.timezone)} – {eventTime(session.ends_at, guide.event.timezone)}</p>}
      {!compact && speakers.length > 0 && <p className="session-speakers">{speakers.map((s) => s.full_name).join(" · ")}</p>}
      <p className="session-location"><MapPin size={14} />{session.room || "Location to be announced"}{!compact && <span className="session-end">Until {eventTime(session.ends_at, guide.event.timezone)}</span>}</p>
    </div><button type="button" className={`icon-button bookmark-button${isSaved ? " is-saved" : ""}`} aria-label={`${isSaved ? "Unsave" : "Save"} ${session.title}`} aria-pressed={isSaved} onClick={() => void toggleSave("session", session.id)}><Bookmark size={20} fill={isSaved ? "currentColor" : "none"} /></button>
  </article>;
}
export function AgendaPlacement({ placement }: { placement: SponsorPlacement }) {
  const { guide } = useApp();
  const sponsor = guide.sponsors.find((s) => s.id === placement.sponsor_id);
  if (!sponsor) return null;
  const tier = guide.tiers.find((t) => t.id === sponsor.tier_id)?.name;
  return <Link href={`/more/sponsors/${sponsor.id}`} className="agenda-ad"><div><span className="eyebrow">SPONSOR SPOTLIGHT {tier && ` / ${tier}`}</span><h3>{placement.headline || sponsor.name}</h3><p>{placement.body || sponsor.description}</p><strong>{sponsor.name}</strong></div><ArrowUpRight size={26} aria-hidden="true" /></Link>;
}
