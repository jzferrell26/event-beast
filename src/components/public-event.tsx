"use client";

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bookmark, CalendarDays, CircleHelp, MapPin, Mic2, Smartphone, Handshake, Utensils, MessagesSquare, Sparkles, Zap, ShieldCheck } from 'lucide-react';
import { eventDay, httpsUrl } from '@/lib/format';
import { useApp } from './app-provider';
import { PageTitle } from './ui';
import { MobileEventAlerts, MobileEventMoment } from './mobile-event';
import { HubMoreScreen } from './hub-more';
import { ImpactPartnersScreen } from './impact-partners';
import { EventSupport, EventWifi } from './event-support';

export function PublicHomeScreen() {
  const { guide, saved } = useApp();
  const quickLinks = [
    { href: '/agenda', label: 'Full agenda', caption: 'Your day, at a glance', icon: CalendarDays },
    { href: '/more/saved', label: 'Saved sessions', caption: saved.sessions.length ? `${saved.sessions.length} saved on this device` : 'Your favorites', icon: Bookmark },
    { href: '/sponsors', label: 'Impact Partners', caption: 'The event partners', icon: Handshake },
    { href: '/more/speakers', label: 'Our Speakers', caption: 'Meet the voices', icon: Mic2 },
    { href: '/more/help', label: 'Venue & help', caption: 'Find your way', icon: MapPin },
    { href: '/feed', label: 'Social wall', caption: 'Share the moment', icon: MessagesSquare },
    { href: '/more/lunch', label: 'Lunch', caption: 'Find your next stop', icon: Utensils },
    { href: '/more/fun-stuff', label: 'Fun Stuff', caption: 'More to explore', icon: Sparkles },
  ];
  return <div className="home-screen public-home">
    <MobileEventAlerts />
    <section className="home-hero"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" />THE LIVE EXPERIENCE<span className="hero-year">2026</span></div><h1>{guide.settings.welcome_title}</h1><p>{guide.settings.welcome_body || 'The full program. The speakers. The details that make your day.'}</p><Link className="button button-red" href="/agenda">Explore the full agenda<ArrowUpRight size={18} /></Link></div><div className="hero-emblem" aria-hidden="true"><span>BUILD</span><span>WHAT’S</span><span>NEXT<span className="red-period">.</span></span></div><div className="hero-bottom"><span>{guide.mode === 'demo' ? 'SAMPLE PROGRAM' : 'YOUR EVENT, IN YOUR POCKET'}</span><span>{guide.event.start_date ? `${eventDay(guide.event.start_date)}${guide.event.end_date ? ` — ${eventDay(guide.event.end_date)}` : ''}` : 'DATES COMING SOON'}</span></div></section>
    <MobileEventMoment />
    <div className="quick-links">{quickLinks.map(({ href, label, caption, icon: Icon }) => <Link href={href} key={href}><span className="quick-icon"><Icon size={22} /></span><div><strong>{label}</strong><span>{caption}</span></div><ArrowUpRight size={17} className="quick-arrow" /></Link>)}</div>
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
  return <ImpactPartnersScreen />;
}

export function PublicHelpScreen() {
  const { guide, notify } = useApp();
  const copyAddress = async (address: string) => { try { await navigator.clipboard.writeText(address); notify('Venue address copied.'); } catch { notify('Copy is unavailable in this browser. Select the address to copy it.', true); } };
  return <><PageTitle eyebrow="A LITTLE HELP GOES A LONG WAY" title="Help, venue, and more." description="Find your way, save this site, and get a real person when you need one." /><div className="help-grid">
    {guide.venues.map((venue,index) => <section className="help-topic help-venue" key={venue.id}><MapPin size={26} /><h2>{venue.title}</h2><p>{venue.location}</p>{httpsUrl(venue.directions_url) && <a className="button button-outline" href={venue.directions_url} target="_blank" rel="noopener noreferrer">Get directions<ArrowUpRight size={17} /></a>}{venue.location && <button className="text-button" type="button" onClick={() => void copyAddress(venue.location)}>Copy address</button>}<p>{venue.description}</p>{index===0&&httpsUrl(guide.settings.venue_floor_plan_url) && <a className="text-button" href={guide.settings.venue_floor_plan_url} target="_blank" rel="noopener noreferrer">Hyatt Regency Dallas floor plan (PDF)<ArrowUpRight size={15} /></a>}</section>)}
    <section className="help-topic"><Smartphone size={26} /><h2>Keep the guide handy.</h2><p><strong>On iPhone:</strong> open this site in Safari, tap Share, then Add to Home Screen.</p><p><strong>On Android:</strong> use your browser menu to choose Install app or Add to Home screen when available.</p><p>Installation is optional. Event information is public; sign in for the social wall and private messages.</p></section>
    <EventWifi />
    <section className="help-topic"><CircleHelp size={26} /><h2>A real person can help.</h2><EventSupport /></section>
  </div></>;
}
