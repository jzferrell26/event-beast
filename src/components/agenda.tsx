"use client";
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, CalendarDays, Clock3, MapPin, Search, X } from "lucide-react";
import { currentAgendaDay, eventDay, eventZoneLabel, sessionSpeakers, sessionTimeRange } from "@/lib/format";
import { useApp, useNow } from "./app-provider";
import { EmptyState, PageTitle } from "./ui";
import { SpeakerPortrait } from "./speaker-portrait";
import { SessionCard, AgendaPlacement } from "./session-card";
import { searchAgenda } from '@/lib/agenda-search';
import { DescriptionText } from './description-text';

export function AgendaScreen({ savedOnly = false }: { savedOnly?: boolean }) {
  const { guide, saved } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const now = useNow();
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(savedOnly);
  const day = guide.days.find((d) => d.id === selected) ?? currentAgendaDay(guide.days, now, guide.event.timezone);
  const searching = Boolean(query.trim());
  const sessions = searchAgenda(guide, {dayId:day?.id,query,savedOnly,onlySaved,saved:saved.sessions});
  const nextSession = [...sessions].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).find(session => Date.parse(session.ends_at) > now) ?? sessions[0];
  const jump = () => {
    const anchor = nextSession && document.getElementById(`agenda-session-${nextSession.id}`);
    if (!anchor) return;
    anchor.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    anchor.focus({ preventScroll: true });
  };
  const moveDay = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const size = guide.days.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % size : event.key === 'ArrowLeft' ? (index + size - 1) % size : event.key === 'Home' ? 0 : event.key === 'End' ? size - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setQuery(''); setSelected(guide.days[next].id);
    const tab = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    tab?.focus();
    if (window.matchMedia('(max-width: 900px)').matches) tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return <><PageTitle eyebrow="MAKE THE MOST OF EVERY MOMENT" title={savedOnly ? "Your saved sessions." : "Your next move."} description={savedOnly ? "The sessions you want to be in the room for." : "Big ideas, practical takeaways, and space to connect."} />
    {guide.settings.agenda_notice && <p className="agenda-working-notice">{guide.settings.agenda_notice}</p>}
    {savedOnly && guide.publicSite && <p className="fine-print">Saved on this device only. No account needed. Clearing browser data removes these favorites.</p>}
    <div className="agenda-controls">
      {!savedOnly && <div className="day-tabs" role="tablist" aria-label="Event day">{guide.days.map((d, index) => <button key={d.id} type="button" role="tab" aria-selected={!searching && day?.id === d.id} tabIndex={day?.id === d.id ? 0 : -1} className={!searching && day?.id === d.id ? "active" : ""} onKeyDown={(event) => moveDay(event, index)} onClick={() => { setQuery(''); setSelected(d.id); }}><strong>{d.label}</strong><span>{eventDay(d.date, { weekday: "short", month: "short", day: "numeric" })}</span></button>)}</div>}
      <div className="agenda-toolbar"><label className="search-field"><Search size={20} /><input aria-label="Search sessions" placeholder="Find a session, speaker or topic" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={18} /></button>}</label>{!savedOnly && <button type="button" className={`filter-button${onlySaved ? " selected" : ""}`} onClick={() => setOnlySaved((s) => !s)} aria-pressed={onlySaved}><Bookmark size={17} />Saved</button>}</div>
    </div>
    <div className="mobile-only mobile-agenda-actions"><span>{onlySaved ? 'Your saved agenda' : 'Find your place in the day'}</span><button type="button" className="text-button" disabled={!nextSession} onClick={jump}><Clock3 size={16} />{nextSession && Date.parse(nextSession.starts_at) <= now && Date.parse(nextSession.ends_at) > now ? 'Jump to now' : nextSession && Date.parse(nextSession.starts_at) > now ? 'Jump to next' : 'First session'}</button></div>
    <div className="agenda-caption"><span role="status">{sessions.length} {sessions.length === 1 ? "session" : "sessions"}{searching ? ` · Searching all ${guide.days.length} event days` : ''}</span><span>All times in {eventZoneLabel(guide.event.timezone)}{guide.mode === "demo" || guide.event.is_demo ? " · Sample schedule" : ""}</span></div>
    {!sessions.length ? <EmptyState title={onlySaved ? "Make room for your favorites." : "No sessions found."} icon={<CalendarDays size={30} />} action={onlySaved && <Link className="button button-dark" href="/agenda">Explore the agenda</Link>}>{onlySaved ? "Tap a bookmark on any session to add it here." : searching ? "Try another topic or clear the search." : "The event team will publish the agenda here."}</EmptyState> : <div className="agenda-list">{!onlySaved && !searching && guide.placements.filter((p) => p.day_id === day?.id && !p.after_session_id).map((p) => <AgendaPlacement key={p.id} placement={p} />)}{sessions.map((session) => <div key={session.id} id={`agenda-session-${session.id}`} className="agenda-session-anchor" tabIndex={-1}><SessionCard session={session} showDay={savedOnly || searching} />{!onlySaved && !searching && guide.placements.filter((p) => p.day_id === day?.id && p.after_session_id === session.id).map((p) => <AgendaPlacement key={p.id} placement={p} />)}</div>)}</div>}
  </>;
}

export function SessionDetail({ id }: { id: string }) {
  const { guide, saved, toggleSave } = useApp();
  const session = guide.sessions.find((s) => s.id === id);
  if (!session) return <EmptyState title="This session is unavailable." action={<Link href="/agenda" className="button button-dark">Back to the agenda</Link>}>It may have been updated by the event team.</EmptyState>;
  const day = guide.days.find((d) => d.id === session.day_id);
  const speakers = sessionSpeakers(guide, session.id);
  const sponsor = guide.sponsors.find((s) => s.id === session.sponsor_id);
  const isSaved = saved.sessions.includes(session.id);
  return <div className="detail-page">
    <Link href="/agenda" className="back-link"><ArrowLeft size={17} />Back to agenda</Link>
    <div className="detail-hero">{!guide.publicSite && <span className="type-pill">{session.session_type}</span>}<h1>{session.title}</h1>
      <div className="detail-facts"><span><CalendarDays size={18} />{day ? `${day.label} · ${eventDay(day.date)}` : "Event session"}</span><span><Clock3 size={18} />{sessionTimeRange(session, guide.event.timezone)}</span><span><MapPin size={18} />{session.room || "Location to be announced"}</span></div>
      {session.is_demo && <span className="sample-note">Sample session · final details will be supplied by the organizer</span>}
    </div>
    <button type="button" className={`button ${isSaved ? "button-outline" : "button-red"}`} onClick={() => void toggleSave("session", id)} aria-pressed={isSaved}><Bookmark size={19} fill={isSaved ? "currentColor" : "none"} />{isSaved ? "Saved to your agenda" : "Save this session"}</button>
    {session.description?.trim() && <section className="detail-section"><h2>In this session</h2><p><DescriptionText text={session.description} /></p></section>}
    {speakers.length > 0 && <section className="detail-section"><h2>In the room with you</h2>{speakers.map((speaker) =>
      <Link className="speaker-card session-speaker-card" href={`/more/speakers/${speaker.id}`} key={speaker.id}>
        <SpeakerPortrait name={speaker.full_name} src={speaker.headshot_url} />
        <div className="session-speaker-copy"><h3>{speaker.full_name}</h3>{speaker.title && <span className="muted">{speaker.title}</span>}<p>{speaker.bio}</p></div>
      </Link>)}</section>}
    {sponsor && <section className="detail-section"><span className="eyebrow">SESSION PARTNER</span><Link href={guide.publicSite ? '/sponsors' : `/more/sponsors/${sponsor.id}`} className="text-button">{sponsor.name}</Link></section>}
    <p className="fine-print">Times are shown in {guide.event.timezone.replaceAll("_", " ")}. Check the agenda for organizer updates.</p>
  </div>;
}
