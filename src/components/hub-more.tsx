"use client";
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Bookmark, CalendarDays, CircleHelp, LogOut, MapPin, MessagesSquare, ShieldCheck, Sparkles, Handshake, UserRound, Users, Utensils } from 'lucide-react';
import { useApp } from './app-provider';
import { errorMessage, mutate } from '@/lib/client';
import { PageTitle } from './ui';
export function HubMoreScreen() {
  const { guide, me, notify } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const rows = [
    ...(guide.communityEnabled ? [
      { href: '/feed', title: 'Social wall', text: 'Shared posts from event attendees', icon: MessagesSquare },
      { href: '/people', title: 'Meet attendees', text: 'Find people who chose to share their profiles', icon: Users },
      { href: '/inbox', title: 'Private messages', text: 'Your one-to-one event conversations', icon: MessagesSquare },
      { href: '/more/profile', title: 'My profile & privacy', text: 'Your introduction, visibility and messaging choices', icon: UserRound },
    ] : []),
    { href: '/agenda', title: 'Full agenda', text: 'The program for every event day', icon: CalendarDays },
    { href: '/more/speakers', title: 'Meet the speakers', text: 'The voices and ideas behind the program', icon: BookOpen },
    { href: '/sponsors', title: 'Impact Partners', text: 'The partners behind the momentum', icon: Handshake },
    { href: '/more/lunch', title: 'Lunch & breakouts', text: 'VIP lunch, breakout rooms, seating and food trucks', icon: Utensils },
    { href: '/more/fun-stuff', title: 'Fun Stuff', text: 'The extra event moments, as the organizer publishes them', icon: Sparkles },
    { href: '/more/venue', title: 'Find your way', text: 'Venue, directions and help', icon: MapPin },
    { href: '/more/saved', title: 'Saved sessions', text: 'Your favorites on this device', icon: Bookmark },
    { href: '/more/help', title: 'Help & home-screen setup', text: 'Keep the website handy on your phone', icon: CircleHelp },
  ];
  return <><PageTitle eyebrow="EVERYTHING FOR THE LIVE EXPERIENCE" title="Everything else. Right here." description="Event information is open to browse. Create or sign in to your verified attendee account for the social wall, profiles and private messages." />
    <div className="more-menu">{rows.map(({ href, title, text, icon: Icon }) => <Link href={href} key={href}><span className="menu-icon"><Icon size={22} /></span><div><h2>{title}</h2><p>{text}</p></div><ArrowRight size={18} /></Link>)}</div>
    {(me?.isAdmin || guide.mode === 'demo') && <Link href="/admin" className="text-button public-organizer-link"><ShieldCheck size={17} />Organizer console<ArrowRight size={16} /></Link>}
    {me?.authenticated ? <button className="text-button sign-out" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await mutate('/api/auth', 'POST', { action: 'sign-out' }); router.replace('/auth?force=1'); router.refresh(); } catch (failure) { notify(errorMessage(failure), true); setBusy(false); } }}><LogOut size={16} />Sign out</button> : <Link href="/auth" className="button button-dark more-sign-in">Attendee sign in<ArrowRight size={17} /></Link>}
  </>;
}
