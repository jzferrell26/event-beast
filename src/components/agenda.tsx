"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, CalendarDays, Clock3, MapPin, Search, X } from "lucide-react";
import { eventDay, eventTime, sessionSpeakers } from "@/lib/format";
import { useApp } from "./app-provider";
import { Avatar, EmptyState, PageTitle } from "./ui";
import { SessionCard, AgendaPlacement } from "./session-card";

export function AgendaScreen({ savedOnly = false }: { savedOnly?: boolean }) {
  const { guide, saved } = useApp();
  const [selected, setSelected] = useState(guide.days[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(savedOnly);
  const day = guide.days.find((d) => d.id === selected) ?? guide.days[0];
  const sessions = guide.sessions.filter((s) => (savedOnly || s.day_id === day?.id) && (!onlySaved || saved.sessions.includes(s.id)) && `${s.title} ${s.description} ${s.room} ${sessionSpeakers(guide, s.id).map((sp) => sp.full_name).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageTitle eyebrow="MAKE THE MOST OF EVERY MOMENT" title={savedOnly ? "Your saved sessions." : "Your next move."} description={savedOnly ? "The sessions you want to be in the room for." : "Big ideas, practical takeaways, and space to connect."} />
    {!savedOnly && <div className="day-tabs" role="tablist" aria-label="Event day">{guide.days.map((d) => <button key={d.id} type="button" role="tab" aria-selected={day?.id === d.id} className={day?.id === d.id ? "active" : ""} onClick={() => setSelected(d.id)}><strong>{d.label}</strong><span>{eventDay(d.date, { weekday: "short", month: "short", day: "numeric" })}</span></button>)}</div>}
    <div className="agenda-toolbar"><label className="search-field"><Search size={20} /><input aria-label="Search sessions" placeholder="Find a session, speaker or topic" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={18} /></button>}</label>{!savedOnly && <button type="button" className={`filter-button${onlySaved ? " selected" : ""}`} onClick={() => setOnlySaved((s) => !s)} aria-pressed={onlySaved}><Bookmark size={17} />Saved</button>}</div>
    <div className="agenda-caption"><span>{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span><span>All times in {guide.event.timezone.replaceAll("_", " ")}{guide.mode === "demo" ? " · Sample schedule" : ""}</span></div>
    {!sessions.length ? <EmptyState title={onlySaved ? "Make room for your favorites." : "No sessions found."} icon={<CalendarDays size={30} />} action={onlySaved && <Link className="button button-dark" href="/agenda">Explore the agenda</Link>}>{onlySaved ? "Tap a bookmark on any session to add it here." : query ? "Try another topic or clear the search." : "The event team will publish the agenda here."}</EmptyState> : <div className="agenda-list">{!onlySaved && !query && guide.placements.filter((p) => p.day_id === day?.id && !p.after_session_id).map((p) => <AgendaPlacement key={p.id} placement={p} />)}{sessions.map((session) => <div key={session.id}>{savedOnly && <p className="saved-day-label">{guide.days.find((d) => d.id === session.day_id)?.label}</p>}<SessionCard session={session} />{!onlySaved && !query && guide.placements.filter((p) => p.day_id === day?.id && p.after_session_id === session.id).map((p) => <AgendaPlacement key={p.id} placement={p} />)}</div>)}</div>}
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
  return <div className="detail-page"><Link href="/agenda" className="back-link"><ArrowLeft size={17} />Back to agenda</Link><div className="detail-hero"><span className="type-pill">{session.session_type}</span><h1>{session.title}</h1><div className="detail-facts"><span><CalendarDays size={18} />{day ? `${day.label} · ${eventDay(day.date)}` : "Event session"}</span><span><Clock3 size={18} />{eventTime(session.starts_at, guide.event.timezone)} – {eventTime(session.ends_at, guide.event.timezone)}</span><span><MapPin size={18} />{session.room || "Location to be announced"}</span></div>{session.is_demo && <span className="sample-note">Sample session · final details will be supplied by the organizer</span>}</div><button type="button" className={`button ${isSaved ? "button-outline" : "button-red"}`} onClick={() => void toggleSave("session", id)} aria-pressed={isSaved}><Bookmark size={19} fill={isSaved ? "currentColor" : "none"} />{isSaved ? "Saved to your agenda" : "Save this session"}</button><section className="detail-section"><h2>In this session</h2><p>{session.description || "Session details will be added by the event team."}</p></section>{speakers.length > 0 && <section className="detail-section"><h2>In the room with you</h2>{speakers.map((speaker) => <article className="speaker-card" key={speaker.id}><Avatar name={speaker.full_name} src={speaker.headshot_url} large /><div><h3>{speaker.full_name}</h3><span className="muted">{speaker.title}</span><p>{speaker.bio}</p></div></article>)}</section>}{sponsor && <section className="detail-section"><span className="eyebrow">SESSION PARTNER</span><Link href={`/more/sponsors/${sponsor.id}`} className="text-button">{sponsor.name}</Link></section>}<p className="fine-print">Times are shown in {guide.event.timezone.replaceAll("_", " ")}. Check the agenda for organizer updates.</p></div>;
}
