"use client";
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, MapPin, Utensils } from 'lucide-react';
import { useApp } from './app-provider';
import { eventDay, httpsUrl } from '@/lib/format';
import { EmptyState, PageTitle } from './ui';
export function LunchInformation() {
  const { guide } = useApp();
  const dates = [...new Set(guide.lunches.map(lunch => lunch.event_date || ''))].sort();
  return <><PageTitle eyebrow="RECHARGE. RECONNECT. REFUEL." title="Make time for lunch." description="Lunch and breakout details by day. Boxed lunches are first come, first served where noted." />
    {!guide.lunches.length ? <EmptyState title="Lunch details are on the way." icon={<Utensils size={30} />}>The organizer will publish the confirmed rooms, options and menus here.</EmptyState> : dates.map(date => <section key={date} className="lunch-day-section"><h2>{date ? eventDay(date, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Lunch options'}</h2><div className="practical-grid">{guide.lunches.filter(lunch => (lunch.event_date || '') === date).map(lunch => <article className="practical-card" key={lunch.id}><div className="practical-card-content"><span className="lunch-category">{lunch.category || 'Lunch'}</span>{lunch.is_demo && <span className="eyebrow">SAMPLE LUNCH INFORMATION</span>}<h3>{lunch.title}</h3><div className="practical-facts"><p><MapPin size={16} />{lunch.location || 'Location to be confirmed'}</p><p><CalendarDays size={16} />{lunch.hours || 'Times to be confirmed'}</p></div><p className="practical-description">{lunch.description}</p>{lunch.dietary_info && <div className="dietary-note"><strong>Menu / dietary notes</strong><p>{lunch.dietary_info}</p></div>}{httpsUrl(lunch.menu_url) && <a className="button button-outline" href={lunch.menu_url} target="_blank" rel="noopener noreferrer">View menu<ArrowUpRight size={17} /></a>}{httpsUrl(lunch.directions_url) && <a className="button button-outline" href={lunch.directions_url} target="_blank" rel="noopener noreferrer">Get directions<ArrowUpRight size={17} /></a>}</div></article>)}</div></section>)}
    <p className="fine-print">Ask the event team or food provider about allergies and dietary needs. Availability is not a reservation.</p><Link href="/more/venue" className="venue-feature"><MapPin size={25} /><div><strong>Need a hand finding it?</strong><p>See venue information and event help.</p></div><ArrowUpRight size={20} /></Link>
  </>;
}
