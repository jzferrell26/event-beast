"use client";
import Link from 'next/link';
import { ArrowRight, BookOpen, Bookmark, CalendarDays, CircleHelp, MessageCircle, MessagesSquare, Sparkles, Handshake, Users, Utensils } from 'lucide-react';
import { useApp } from './app-provider';
import { PageTitle } from './ui';
import { SignOutButton } from './sign-out';
export function HubMoreScreen() {
  const { guide, me } = useApp();
  const rows = [
    ...(guide.communityEnabled ? [
      { href: '/people', title: 'Meet attendees', text: 'Find people who chose to share their profiles', icon: Users },
      { href: '/inbox', title: 'Private messages', text: 'Your one-to-one event conversations', icon: MessageCircle },
      { href: '/feed', title: 'Social wall', text: 'Shared posts from event attendees', icon: MessagesSquare },
    ] : []),
    { href: '/sponsors', title: 'Impact Partners', text: 'The partners behind the momentum', icon: Handshake },
    { href: '/agenda', title: 'Full agenda', text: 'The program for every event day', icon: CalendarDays },
    { href: '/more/saved', title: 'Saved sessions', text: 'Your favorites on this device', icon: Bookmark },
    { href: '/more/speakers', title: 'Meet the speakers', text: 'The voices and ideas behind the program', icon: BookOpen },
    { href: '/more/lunch', title: 'Lunch & breakouts', text: 'VIP lunch, breakout rooms, seating and food trucks', icon: Utensils },
    { href: '/more/fun-stuff', title: 'Fun Stuff', text: 'The extra event moments, as the organizer publishes them', icon: Sparkles },
    { href: '/more/help', title: 'Help, Venue, and More', text: 'Find your way, save this site, etc.', icon: CircleHelp },
  ];
  return <><PageTitle eyebrow="EVERYTHING FOR THE LIVE EXPERIENCE" title="Everything else. Right here." description="Event information is open to browse. Create or sign in to your verified attendee account for the social wall, profiles and private messages." />
    {me?.authenticated && guide.mode !== 'demo' && <section className="account-actions" aria-label="Your account"><div><strong>{me.profile?.full_name || 'Your event account'}</strong><p>Signed in on this browser.</p></div><SignOutButton /></section>}
    <div className="more-menu">{rows.map(({ href, title, text, icon: Icon }) => <Link href={href} key={href}><span className="menu-icon"><Icon size={22} /></span><div><h2>{title}</h2><p>{text}</p></div><ArrowRight size={18} /></Link>)}</div>
    {!me?.authenticated && <Link href="/auth" className="button button-dark more-sign-in">Attendee sign in<ArrowRight size={17} /></Link>}
  </>;
}
