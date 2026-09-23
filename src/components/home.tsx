"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Users, Trophy, Utensils, MapPin, Clock3, Zap } from "lucide-react";
import { activeAnnouncements, eventDay, sessionState } from "@/lib/format";
import { useApp, useNow } from "./app-provider";
import { SectionTitle } from "./ui";
import { SessionCard } from "./session-card";
import { Onboarding } from "./onboarding";

export function HomeScreen() {
  const { guide, saved } = useApp();
  const now = useNow();
  const active = guide.sessions.filter((s) => sessionState(s, now) === "now");
  const upcoming = guide.sessions.filter((s) => sessionState(s, now) === "upcoming");
  const alerts = activeAnnouncements(guide.announcements, now);
  const quickLinks = [
    { href: "/agenda", label: "The agenda", icon: CalendarDays, caption: "Plan your day" },
    { href: "/people", label: "Your people", icon: Users, caption: "Make a connection" },
    { href: "/more/sponsors", label: "Our sponsors", icon: Trophy, caption: "Meet the partners" },
    { href: "/more/lunch", label: "Lunch", icon: Utensils, caption: "Take a breather" },
  ];
  return <div className="home-screen">
    <section className="home-hero"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" />THE LIVE EXPERIENCE<span className="hero-year">2026</span></div><h1>{guide.settings.welcome_title}</h1><p>{guide.settings.welcome_body}</p><Link className="button button-red" href="/agenda">Find your next session<ArrowUpRight size={18} /></Link></div><div className="hero-emblem" aria-hidden="true"><span>BUILD</span><span>WHAT’S</span><span>NEXT<span className="red-period">.</span></span></div><div className="hero-bottom"><span>{guide.mode === "demo" ? "SAMPLE PROGRAM" : "YOUR EVENT, IN YOUR POCKET"}</span><span>{guide.event.start_date ? `${eventDay(guide.event.start_date)}${guide.event.end_date ? ` — ${eventDay(guide.event.end_date)}` : ""}` : "DATES COMING SOON"}<ArrowUpRight size={14} /></span></div></section>
    <div className="quick-links">{quickLinks.map(({ href, label, icon: Icon, caption }) => <Link href={href} key={href}><span className="quick-icon"><Icon size={22} strokeWidth={1.8} /></span><div><strong>{label}</strong><span>{caption}</span></div><ArrowUpRight size={17} className="quick-arrow" /></Link>)}</div>
    <Onboarding />
    {alerts.slice(0, 2).map((alert) => <Link href="/more/notifications" className={`home-announcement announcement-${alert.severity}`} key={alert.id}><span className="announcement-icon"><Zap size={20} /></span><div><span className="eyebrow">{alert.severity === "urgent" ? "EVENT ALERT" : "FROM THE EVENT TEAM"}</span><strong>{alert.title}</strong><p>{alert.body}</p></div><ArrowRight size={18} /></Link>)}
    <div className="home-grid"><section><SectionTitle title="Happening now" href="/agenda" action="Full agenda" />{active.length ? active.map((session) => <SessionCard key={session.id} session={session} compact />) : <div className="quiet-card"><Clock3 size={25} /><div><h3>A moment between the momentum.</h3><p>No sessions are live right now. Check what’s coming up and make a plan.</p></div></div>}<SectionTitle title="Up next" />{upcoming.length ? upcoming.slice(0, 2).map((s) => <SessionCard key={s.id} session={s} compact />) : <div className="quiet-card"><div><h3>{guide.sessions.length ? "Keep the connections going." : "Your program is on its way."}</h3><p>{guide.sessions.length ? "There are no more scheduled sessions. Find your new connections in People." : "The event team will publish the agenda here."}</p></div></div>}</section>
      <aside className="home-aside"><Link href="/people" className="connection-card"><span className="eyebrow">MAKE IT A MEANINGFUL EVENT</span><div className="connection-avatars" aria-hidden="true"><span>MB</span><span>+</span><span>YOU</span></div><h2>The best thing in the room?<br />The people.</h2><p>Find a familiar face. Meet your next collaborator. Start a conversation that goes somewhere.</p><span className="card-link">Explore the directory<ArrowUpRight size={20} /></span></Link><Link href="/more/saved" className="small-feature"><CalendarDays size={23} /><div><strong>Your saved sessions</strong><span>{saved.sessions.length ? `${saved.sessions.length} on your personal agenda` : "Build a day that’s yours"}</span></div><ArrowRight size={18} /></Link><Link href="/more/venue" className="venue-feature"><MapPin size={24} /><div><strong>Right place. Right time.</strong><p>Venue details, directions and help.</p></div><ArrowUpRight size={20} /></Link></aside></div>
  </div>;
}
