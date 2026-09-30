"use client";

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bookmark, MapPin, UserRound, Zap } from 'lucide-react';
import { activeAnnouncements, eventTime, sessionTimeRange } from '@/lib/format';
import { eventMoment, mobileSessionDate } from '@/lib/mobile-event';
import type { AgendaSession } from '@/lib/types';
import { useApp, useNow } from './app-provider';

export function MobileEventAlerts() {
  const { guide } = useApp();
  const now = useNow();
  const priority = { urgent: 0, important: 1, info: 2 };
  const alerts = activeAnnouncements(guide.announcements, now)
    .filter(alert => alert.severity !== 'info').sort((a, b) => priority[a.severity] - priority[b.severity]);
  if (!alerts.length || guide.settings.announcements_enabled === false) return null;
  return <section className="mobile-only mobile-event-alerts" aria-label="Important event updates">
    {alerts.slice(0, 2).map(alert => <Link prefetch={false} className={`home-announcement announcement-${alert.severity}`} href="/more/notifications" key={alert.id}>
      <Zap size={20} aria-hidden="true" /><div><span className="eyebrow">{alert.severity === 'urgent' ? 'Event alert' : 'Important update'}</span><strong>{alert.title}</strong><p>{alert.body}</p></div><ArrowRight size={18} aria-hidden="true" />
    </Link>)}
  </section>;
}

export function MobileEventMoment() {
  const { guide, saved } = useApp();
  const now = useNow();
  const moment = eventMoment(guide, now);
  const session = moment.current[0] ?? moment.next;
  const summary = (item: AgendaSession) => `${mobileSessionDate(item.starts_at, now, guide.event.timezone)} · ${sessionTimeRange(item, guide.event.timezone)}`;
  return <section className="mobile-only mobile-event-moment" aria-label="Your event at a glance">
    {session ? <Link prefetch={false} href={`/agenda/${session.id}`} className={`mobile-next-session${moment.phase === 'live' ? ' is-live' : ''}`}>
      <span className="mobile-moment-label">{moment.phase === 'live' ? 'Happening now' : 'Coming up'}{moment.current.length > 1 ? ` · ${moment.current.length} sessions live` : ''}</span>
      <strong>{session.title}</strong><span className="mobile-moment-time">{summary(session)}</span>
      <span className="mobile-moment-room"><MapPin size={15} aria-hidden="true" />{session.room || 'Location to be announced'}<ArrowUpRight size={17} aria-hidden="true" /></span>
    </Link> : <Link prefetch={false} href={moment.phase === 'ended' && !guide.publicSite ? '/people' : '/agenda'} className="mobile-next-session">
      <span className="mobile-moment-label">{moment.phase === 'ended' ? 'Keep the momentum going' : 'Your event at a glance'}</span>
      <strong>{moment.phase === 'ended' ? guide.publicSite ? 'Keep the big ideas close.' : 'Keep your connections close.' : 'The program is being prepared.'}</strong>
      <span className="mobile-moment-time">{moment.phase === 'ended' ? guide.publicSite ? 'No more sessions are scheduled. Browse the full program anytime.' : 'No more sessions are scheduled. Visit People to reconnect.' : 'Open the agenda for the latest published details.'}</span>
    </Link>}
    {moment.current.length > 0 && moment.next && <Link prefetch={false} href={`/agenda/${moment.next.id}`} className="mobile-following-session"><span>Up next · {mobileSessionDate(moment.next.starts_at, now, guide.event.timezone)} · {eventTime(moment.next.starts_at, guide.event.timezone)}</span><strong>{moment.next.title}</strong><ArrowRight size={17} aria-hidden="true" /></Link>}
    <nav className="mobile-day-shortcuts" aria-label="Event-day shortcuts">
      <Link prefetch={false} href="/more/venue"><MapPin size={19} aria-hidden="true" /><span>Venue & help</span></Link>
      <Link prefetch={false} href="/more/saved"><Bookmark size={19} aria-hidden="true" /><span>Saved{saved.sessions.length > 0 ? ` (${saved.sessions.length})` : ' sessions'}</span></Link>
      <Link prefetch={false} href="/more/speakers"><UserRound size={19} aria-hidden="true" /><span>Speakers</span></Link>
    </nav>
  </section>;
}
