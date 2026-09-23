"use client";
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CalendarDays, Search, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Avatar, EmptyState, PageTitle, SectionTitle } from './ui';
import { SessionCard } from './session-card';
import { httpsUrl } from '@/lib/format';

export function SpeakersScreen() {
  const { guide } = useApp();
  const [query, setQuery] = useState('');
  const speakers = [...guide.speakers].filter(speaker => `${speaker.full_name} ${speaker.title} ${speaker.bio}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return <><PageTitle eyebrow="THE VOICES IN THE ROOM" title="Meet your speakers." description="Explore the people bringing ideas and perspective to Momentum Builder." />
    <label className="search-field"><Search size={19} /><input value={query} aria-label="Search speakers" placeholder="Find a speaker or topic" onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear speaker search" onClick={() => setQuery('')}><X size={18} /></button>}</label>
    <p className="results-caption">{speakers.length} speakers{guide.mode === 'demo' ? ' · Sample profiles' : ''}</p>
    <div className="people-grid">{speakers.map(speaker => <Link className="person-card" href={`/more/speakers/${speaker.id}`} key={speaker.id}>
      <div className="person-top"><Avatar name={speaker.full_name} src={speaker.headshot_url} large /></div><div className="person-name"><h2>{speaker.full_name}</h2></div><p className="person-role">{speaker.title || speaker.bio || 'Speaker details coming soon'}</p><span className="person-link">View speaker & sessions<ArrowUpRight size={16} /></span>
    </Link>)}</div>
    {!speakers.length && <EmptyState title="No speakers found.">Try another name, or check back as the program develops.</EmptyState>}
  </>;
}

export function SpeakerDetail({ id }: { id: string }) {
  const { guide } = useApp();
  const speaker = guide.speakers.find(item => item.id === id);
  if (!speaker) return <EmptyState title="This speaker is unavailable." action={<Link href="/more/speakers" className="button button-dark">All speakers</Link>}>The event team may be updating their information.</EmptyState>;
  const sessionIds = new Set(guide.sessionSpeakers.filter(link => link.speaker_id === id).map(link => link.session_id));
  const sessions = guide.sessions.filter(session => sessionIds.has(session.id));
  return <div className="detail-page"><Link href="/more/speakers" className="back-link"><ArrowLeft size={17} />All speakers</Link>
    <section className="speaker-profile-hero"><Avatar name={speaker.full_name} src={speaker.headshot_url} large /><div><span className="eyebrow">MOMENTUM BUILDER SPEAKER</span><h1>{speaker.full_name}</h1>{speaker.title && <p>{speaker.title}</p>}</div></section>
    <section className="detail-section"><h2>About {speaker.full_name}</h2><p>{speaker.bio || 'The event team is preparing this speaker’s biography.'}</p>{httpsUrl(speaker.source_url) && <a href={speaker.source_url} className="text-button" target="_blank" rel="noopener noreferrer">Official event speaker information<ArrowUpRight size={15} /></a>}</section>
    <SectionTitle title="Catch them on the agenda" />{sessions.length ? <div className="agenda-list">{sessions.map(session => <SessionCard key={session.id} session={session} />)}</div> : <EmptyState title="Session details are being finalized." icon={<CalendarDays size={26} />}>Check back as the organizer updates the working program.</EmptyState>}
  </div>;
}
