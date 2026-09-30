"use client";
import Link from "next/link";
import { CalendarDays, MapPin, Sparkles, UsersRound } from "lucide-react";
import { useApp } from "./app-provider";
import { EmptyState, PageTitle } from "./ui";
import { eventTime } from "@/lib/format";

export function ActivitiesScreen() {
  const { guide } = useApp();
  const activities = [...(guide.activities ?? [])].sort((a,b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '') || a.sort_order - b.sort_order);
  return <><PageTitle eyebrow="MORE THAN THE MAIN STAGE" title="Breakouts & activities." description="Parties, meetups, book signings, bonus sessions and the moments worth showing up for." />
    {!activities.length ? <EmptyState title="More ways to connect are coming." icon={<Sparkles size={30}/>}>The event team will publish activities here as details are confirmed.</EmptyState> :
      <div className="practical-grid">{activities.map(activity => <article className="practical-card" key={activity.id}><div className="practical-card-content"><span className="eyebrow">{activity.activity_type.toUpperCase()}</span><h2>{activity.title}</h2><div className="practical-facts">{activity.starts_at && <p><CalendarDays size={16}/>{eventTime(activity.starts_at, guide.event.timezone)}{activity.ends_at ? ' – ' + eventTime(activity.ends_at, guide.event.timezone) : ''}</p>}{activity.location && <p><MapPin size={16}/>{activity.location}</p>}{activity.host && <p><UsersRound size={16}/>{activity.host}</p>}</div>{activity.description && <p className="practical-description">{activity.description}</p>}{activity.capacity_note && <div className="dietary-note"><strong>Availability</strong><p>{activity.capacity_note}</p></div>}</div></article>)}</div>}
    <Link href="/agenda" className="text-button">Back to the full agenda</Link>
  </>;
}
