"use client";

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bookmark, CalendarDays, CircleHelp, Clock3, MapPin, Mic2, ShieldCheck, Smartphone, Trophy, Utensils, WifiOff, Zap } from 'lucide-react';
import { activeAnnouncements, eventDay, httpsUrl, sessionState } from '@/lib/format';
import { useApp, useNow } from './app-provider';
import { EmptyState, PageTitle, SectionTitle } from './ui';
import { MobileEventAlerts, MobileEventMoment } from './mobile-event';
import { SessionCard } from './session-card';
import { HubMoreScreen } from './hub-more';

export function PublicHomeScreen() {
  const { guide, saved } = useApp();
  const now = useNow();
  const current = guide.sessions.filter(session => sessionState(session, now) === 'now');
  const upcoming = guide.sessions.filter(session => sessionState(session, now) === 'upcoming').slice(0, 3);
  const quickLinks = [
    { href: '/agenda', label: 'Full agenda', caption: 'Your day, at a glance', icon: CalendarDays },
    { href: '/more/speakers', label: 'The speakers', caption: 'Meet the voices', icon: Mic2 },
    { href: '/sponsors', label: 'Our sponsors', caption: 'The event partners', icon: Trophy },
    { href: '/more/lunch', label: 'Lunch', caption: 'Find your next stop', icon: Utensils },
  ];
  return <div className="home-screen public-home">
    <MobileEventAlerts />
    <section className="home-hero"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" />THE LIVE EXPERIENCE<span className="hero-year">2026</span></div><h1>{guide.settings.welcome_title}</h1><p>{guide.settings.welcome_body || 'The full program. The speakers. The details that make your day.'}</p><Link className="button button-red" href="/agenda">Explore the full agenda<ArrowUpRight size={18} /></Link></div><div className="hero-emblem" aria-hidden="true"><span>BUILD</span><span>WHAT’S</span><span>NEXT<span className="red-period">.</span></span></div><div className="hero-bottom"><span>{guide.mode === 'demo' ? 'SAMPLE PROGRAM' : 'YOUR EVENT, IN YOUR POCKET'}</span><span>{guide.event.start_date ? `${eventDay(guide.event.start_date)}${guide.event.end_date ? ` — ${eventDay(guide.event.end_date)}` : ''}` : 'DATES COMING SOON'}<ArrowUpRight size={14} /></span></div></section>
    <MobileEventMoment />
    {guide.communityEnabled && <section className="hub-welcome"><h2>Your people are here.</h2><p>Join the event’s shared social wall, find attendees and keep your one-to-one conversations in private messages.</p><Link href="/feed" className="button button-red">Open the social wall<ArrowRight size={16} /></Link><Link href="/inbox" className="text-button">Private messages<ArrowRight size={16} /></Link></section>}
    <div className="quick-links">{quickLinks.map(({ href, label, caption, icon: Icon }) => <Link href={href} key={href}><span className="quick-icon"><Icon size={22} /></span><div><strong>{label}</strong><span>{caption}</span></div><ArrowUpRight size={17} className="quick-arrow" /></Link>)}</div>
    {activeAnnouncements(guide.announcements, now).slice(0, 2).map(alert => <Link href="/more/notifications" className={`home-announcement announcement-${alert.severity}`} key={alert.id}><span className="announcement-icon"><Zap size={20} /></span><div><span className="eyebrow">FROM THE EVENT TEAM</span><strong>{alert.title}</strong><p>{alert.body}</p></div><ArrowRight size={18} /></Link>)}
    <div className="home-grid"><section><SectionTitle title="Happening now" href="/agenda" action="Full agenda" />{current.length ? current.map(session => <SessionCard key={session.id} session={session} compact />) : <div className="quiet-card"><Clock3 size={25} /><div><h3>A moment between the momentum.</h3><p>No sessions are live right now. The full agenda has the latest published times.</p></div></div>}<SectionTitle title="Up next" />{upcoming.length ? upcoming.map(session => <SessionCard key={session.id} session={session} compact />) : <div className="quiet-card"><CalendarDays size={25} /><div><h3>{guide.sessions.length ? 'Keep the momentum going.' : 'Your program is on its way.'}</h3><p>{guide.sessions.length ? 'Browse the full program and speaker biographies anytime.' : 'The event team will publish the agenda here.'}</p></div></div>}</section>
      <aside className="home-aside"><Link href="/more/speakers" className="connection-card"><span className="eyebrow">THE VOICES IN THE ROOM</span><Mic2 size={38} aria-hidden="true" /><h2>Big ideas.<br />Meet the speakers.</h2><p>Explore the people bringing their perspective to the stage and find their sessions.</p><span className="card-link">Meet the speakers<ArrowUpRight size={20} /></span></Link><Link href="/more/saved" className="small-feature"><Bookmark size={23} /><div><strong>Your saved sessions</strong><span>{saved.sessions.length ? `${saved.sessions.length} saved on this device` : 'No account needed. Saved on this device.'}</span></div><ArrowRight size={18} /></Link><Link href="/more/venue" className="venue-feature"><MapPin size={24} /><div><strong>Right place. Right time.</strong><p>Venue details, directions and help.</p></div><ArrowUpRight size={20} /></Link></aside></div>
  </div>;
}

export function PublicMoreScreen() {
  const { guide } = useApp();
  if (guide.communityEnabled) return <HubMoreScreen />;
  const rows = [
    { href: '/more/lunch', title: 'Lunch & a little downtime', text: 'What, when and where to eat', icon: Utensils },
    { href: '/more/venue', title: 'Find your way', text: 'Venue, directions and event help', icon: MapPin },
    { href: '/more/saved', title: 'Saved sessions', text: 'Your favorites, stored on this device', icon: Bookmark },
    ...(guide.settings.announcements_enabled !== false ? [{ href: '/more/notifications', title: 'Event updates', text: 'The latest from the organizer', icon: Zap }] : []),
    { href: '/more/fun-stuff', title: 'Fun Stuff', text: 'Extra event moments from the organizer', icon: Mic2 },
    { href: '/more/help', title: 'A little help', text: 'Using the public guide and finding support', icon: CircleHelp },
  ];
  return <><PageTitle eyebrow="THE DETAILS THAT MAKE THE DAY" title="Everything else. Right here." description="Open the guide. Find what you need. Get back to the event." /><div className="public-guide-note"><ShieldCheck size={24} /><p>No attendee account needed. The agenda, speakers, sponsors and event details are open to everyone with this link.</p></div><div className="more-menu">{rows.map(({ href, title, text, icon: Icon }) => <Link href={href} key={href}><span className="menu-icon"><Icon size={22} /></span><div><h2>{title}</h2><p>{text}</p></div><ArrowRight size={18} /></Link>)}</div><Link href="/admin" className="text-button public-organizer-link"><ShieldCheck size={17} />Organizer console<ArrowRight size={16} /></Link></>;
}

export function PublicSponsorsScreen() {
  const { guide } = useApp();
  const groups = [...[...guide.tiers].sort((a, b) => a.sort_order - b.sort_order).map(tier => ({ id: tier.id, name: tier.name })), { id: null, name: 'Event partners' }];
  return <><PageTitle eyebrow="THE PARTNERS BEHIND THE MOMENTUM" title="Better, together." description="Thank you to the partners making Momentum Builder LIVE possible." />{!guide.sponsors.length && <EmptyState title="Meet our partners soon." icon={<Trophy size={30} />}>The event team will publish the sponsor lineup here.</EmptyState>}{groups.map(group => {
    const sponsors = guide.sponsors.filter(sponsor => sponsor.tier_id === group.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    if (!sponsors.length) return null;
    return <section key={group.id ?? 'other'} className="sponsor-tier public-sponsor-tier"><h2 className="tier-heading"><span />{group.name}<span /></h2><div className="public-sponsor-grid">{sponsors.map(sponsor => <article className="public-sponsor-logo-card" key={sponsor.id}><div className="public-sponsor-logo">{httpsUrl(sponsor.logo_url) ? <Image src={sponsor.logo_url} alt={`${sponsor.name} logo`} fill sizes="(max-width: 600px) 44vw, (max-width: 1000px) 30vw, 260px" unoptimized /> : <span>{sponsor.name}</span>}</div><h3>{sponsor.name}</h3>{httpsUrl(sponsor.cta_url) && <a href={sponsor.cta_url} target="_blank" rel="noopener noreferrer" className="text-button">{sponsor.cta_label || "Visit website"}<ArrowUpRight size={15} /></a>}{sponsor.is_demo && <small>Sample sponsor</small>}</article>)}</div></section>;
  })}</>;
}

export function PublicHelpScreen() {
  const { guide } = useApp();
  return <><PageTitle eyebrow="A LITTLE HELP GOES A LONG WAY" title="You’re in good hands." description="Your event essentials, without another account or app download." /><div className="help-grid">
    <section className="help-topic"><CalendarDays size={26} /><h2>Start with the agenda.</h2><p>Choose an event day, search for a session or speaker, and tap a session for its details. Times use the event timezone, even when your phone is set to another zone.</p><p>Use the bookmark to save sessions on this device. These favorites do not sync to other browsers and are removed when you clear site data.</p><Link href="/agenda" className="text-button">Open the agenda<ArrowRight size={15} /></Link></section>
    <section className="help-topic"><Smartphone size={26} /><h2>Keep the guide handy.</h2><p><strong>On iPhone:</strong> open this site in Safari, tap Share, then Add to Home Screen.</p><p><strong>On Android:</strong> use your browser menu to choose Install app or Add to Home screen when available.</p><p>Installation is optional. Event information is public; sign in for the social wall and private messages.</p></section>
    <section className="help-topic"><WifiOff size={26} /><h2>A little less dependent on Wi-Fi.</h2><p>Load the guide while connected before the event. Your saved offline guide includes the last loaded public agenda, sponsors, lunch and venue details. The social wall, private messages and organizer editing require a connection.</p><p>Offline details can be out of date. Reconnect and refresh for schedule changes. Some external images need a connection.</p><a href="/offline.html" className="text-button">Open the offline guide<ArrowRight size={15} /></a></section>
    <section className="help-topic"><CircleHelp size={26} /><h2>A real person can help.</h2><p>{guide.settings.support_location || 'Ask the event team for help with locations or schedule updates.'}</p>{guide.settings.support_email && <a className="text-button" href={`mailto:${encodeURIComponent(guide.settings.support_email)}`}>Contact the event team<ArrowRight size={15} /></a>}<p>Use your registered email to sign in for the event social wall and private messages. Your profile is hidden until you choose to appear in People. Posting shares your profile name with other verified attendees.</p><Link className="text-button" href="/auth">Attendee sign in<ArrowRight size={15} /></Link><Link className="text-button" href="/admin">Organizer sign in<ArrowRight size={15} /></Link></section>
  </div></>;
}
