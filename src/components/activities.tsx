"use client";
import Link from "next/link";
import { CalendarDays, MapPin, Sparkles, UsersRound } from "lucide-react";
import { useApp } from "./app-provider";
import { EmptyState, PageTitle } from "./ui";
import { eventTime } from "@/lib/format";

export function ActivitiesScreen() {
  const { guide } = useApp();
  const activities = [...(guide.activities ?? [])].sort((a,b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '') || a.sort_order - b.sort_order);
  return <><PageTitle eyebrow="MORE THAN THE MAIN STAGE" title="Fun Stuff." description="Extra event moments from the organizer. Lunch breakout rooms and details are on the Lunch page." />
    {!activities.length ? <EmptyState title="The fun details are on their way." icon={<Sparkles size={30}/>}>Sonia is preparing this page. Check the agenda for currently published event moments, and Lunch for breakout details.</EmptyState> :
      <div className="practical-grid">{activities.map(activity => <article className="practical-card" key={activity.id}><div className="practical-card-content"><span className="eyebrow">{activity.activity_type.toUpperCase()}</span><h2>{activity.title}</h2><div className="practical-facts">{activity.starts_at && <p><CalendarDays size={16}/>{new Intl.DateTimeFormat("en-US", { weekday:"short", month:"short", day:"numeric", timeZone:guide.event.timezone }).format(new Date(activity.starts_at))} · {eventTime(activity.starts_at, guide.event.timezone)}{activity.ends_at ? ' – ' + eventTime(activity.ends_at, guide.event.timezone) : ''}</p>}{activity.location && <p><MapPin size={16}/>{activity.location}</p>}{activity.host && <p><UsersRound size={16}/>{activity.host}</p>}</div>{activity.description && <p className="practical-description">{activity.description}</p>}{activity.capacity_note && <div className="dietary-note"><strong>Availability</strong><p>{activity.capacity_note}</p></div>}</div></article>)}</div>}
    <Link href="/agenda" className="text-button">Back to the full agenda</Link>
  </>;
}
