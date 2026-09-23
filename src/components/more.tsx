"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, Bookmark, CalendarDays, CircleHelp, Compass, LogOut, Mail, MapPin, ShieldCheck, Smartphone, Trophy, UserRound, Utensils, WifiOff, Zap, Settings2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { activeAnnouncements, eventDay, httpsUrl, initials } from "@/lib/format";
import { errorMessage, mutate } from "@/lib/client";
import { useApp, useNow } from "./app-provider";
import { Avatar, EmptyState, PageTitle, SectionTitle } from "./ui";
import { Onboarding } from "./onboarding";

export function MoreScreen() {
  const { guide, me, notify } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const rows = [
    { href: "/more/sponsors", name: "Our sponsors", detail: "The partners behind the momentum", icon: Trophy },
    { href: "/more/lunch", name: "Lunch & a little downtime", detail: "What, when and where to eat", icon: Utensils },
    { href: "/more/venue", name: "Find your way", detail: "Venue, directions and the welcome desk", icon: MapPin },
    { href: "/more/profile", name: "My profile", detail: "Your introduction and privacy choices", icon: UserRound },
    { href: "/more/saved", name: "Saved sessions", detail: "The moments you don’t want to miss", icon: Bookmark },
    { href: "/more/notifications", name: "Event updates", detail: "The latest from the organizer", icon: Bell },
    { href: "/more/help", name: "A little help", detail: "App walkthrough, installation and support", icon: CircleHelp },
  ];
  const signOut = async () => {
    setBusy(true);
    try { await mutate("/api/auth", "POST", { action: "sign-out" }); router.replace("/auth"); router.refresh(); }
    catch (error) { notify(errorMessage(error), true); setBusy(false); }
  };
  return <><PageTitle eyebrow="THE DETAILS THAT MAKE THE DAY" title="Everything else. Right here." description="Find your way, make it yours, and keep the momentum going." /><Link href="/more/profile" className="my-profile-banner"><Avatar name={me?.profile?.full_name ?? "Your profile"} src={me?.profile?.avatar_url} large /><div><span className="eyebrow">YOUR EVENT IDENTITY</span><h2>{me?.profile?.full_name ?? "Make yourself known."}</h2><p>{me?.profile?.company || "Your people should be able to find you."}</p></div><ArrowUpRight size={22} /></Link><div className="more-menu">{rows.map(({ href, name, detail, icon: Icon }) => <Link key={href} href={href}><span className="menu-icon"><Icon size={22} /></span><div><h2>{name}</h2><p>{detail}</p></div><ArrowRight size={18} /></Link>)}{(guide.mode === "demo" || me?.isAdmin) && <Link href="/admin"><span className="menu-icon"><Settings2 size={22} /></span><div><h2>Organizer console</h2><p>{guide.mode === "demo" ? "Explore the sample organizer tools" : "Manage this event"}</p></div><ArrowRight size={18} /></Link>}</div>{me?.authenticated ? <button type="button" className="text-button sign-out" disabled={busy} onClick={() => void signOut()}><LogOut size={16} />{busy ? "Signing out…" : "Sign out"}</button> : <Link href="/auth" className="button button-dark more-sign-in">Attendee sign in<ArrowRight size={17} /></Link>}</>;
}

export function SponsorsScreen() {
  const { guide } = useApp();
  const tiers = [...guide.tiers].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const groups = [...tiers.map((t) => ({ id: t.id, name: t.name })), { id: null, name: "Event partners" }];
  return <><PageTitle eyebrow="THE PARTNERS BEHIND THE MOMENTUM" title="Better, together." description="Meet the businesses helping make this event happen." />{!guide.sponsors.length && <EmptyState title="Meet our partners soon." icon={<Trophy size={30} />}>The event team will publish sponsor details here.</EmptyState>}{groups.map((group) => {
    const sponsors = guide.sponsors.filter((s) => s.tier_id === group.id).sort((a, b) => a.sort_order - b.sort_order || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
    if (!sponsors.length) return null;
    return <section className="sponsor-tier" key={group.id ?? "other"}><div className="tier-heading"><span />{group.name}<span /></div><div className="sponsor-grid">{sponsors.map((sponsor) => <Link href={`/more/sponsors/${sponsor.id}`} className="sponsor-card" key={sponsor.id}><div className="sponsor-logo">{httpsUrl(sponsor.logo_url) ? <img src={sponsor.logo_url} alt={`${sponsor.name} logo`} loading="lazy" /> : <span>{sponsor.name.replace(" · Sample", "")}</span>}</div><div className="sponsor-card-copy"><div className="sponsor-card-heading"><h2>{sponsor.name}</h2><ArrowUpRight size={18} /></div><p>{sponsor.description}</p><span><MapPin size={13} />{sponsor.booth || "Location to be announced"}</span>{sponsor.is_demo && <small>Sample sponsor · illustrative placement</small>}</div></Link>)}</div></section>;
  })}<p className="fine-print sponsor-fine-print">Sponsor order follows the event team’s tier and placement settings.</p></>;
}

export function LunchScreen() {
  const { guide } = useApp();
  return <><PageTitle eyebrow="RECHARGE. RECONNECT. REFUEL." title="Make time for lunch." description="Good food and a good conversation belong on the agenda, too." />{!guide.lunches.length ? <EmptyState title="Lunch details are on the way." icon={<Utensils size={30} />}>Check back for the organizer’s menu, locations and times.</EmptyState> : <div className="practical-grid">{guide.lunches.map((lunch) => <article className="practical-card" key={lunch.id}>{httpsUrl(lunch.image_url) && <img className="practical-image" src={lunch.image_url} alt={lunch.title} loading="lazy" />}<div className="practical-card-content"><span className="practical-icon"><Utensils size={26} /></span>{lunch.is_demo && <span className="eyebrow">SAMPLE LUNCH INFORMATION</span>}<h2>{lunch.title}</h2><div className="practical-facts"><p><MapPin size={16} />{lunch.location || "Location to be confirmed"}</p><p><CalendarDays size={16} />{lunch.hours || "Times to be confirmed"}</p></div><p className="practical-description">{lunch.description}</p><div className="dietary-note"><strong>Dietary information</strong><p>{lunch.dietary_info || "The organizer has not supplied dietary information. Please ask the event team about your needs."}</p></div>{httpsUrl(lunch.directions_url) && <a className="button button-outline" href={lunch.directions_url} target="_blank" rel="noopener noreferrer">Get directions<ArrowUpRight size={17} /></a>}</div></article>)}</div>}<Link href="/more/venue" className="venue-feature"><MapPin size={25} /><div><strong>Need a hand finding it?</strong><p>See venue information and event help.</p></div><ArrowUpRight size={20} /></Link></>;
}

export function VenueScreen() {
  const { guide } = useApp();
  return <><PageTitle eyebrow="RIGHT PLACE. RIGHT TIME." title="Find your way." description="Less looking around. More being in the room." />{!guide.venues.length ? <EmptyState title="Your venue guide is coming soon." icon={<Compass size={30} />}>The organizer will add locations, maps and directions here.</EmptyState> : <div className="practical-grid">{guide.venues.map((venue, index) => <article className="practical-card" key={venue.id}><div className="practical-card-content"><span className="venue-number">0{index + 1}</span>{venue.is_demo && <span className="eyebrow">SAMPLE VENUE INFORMATION</span>}<h2>{venue.title}</h2><div className="practical-facts"><p><MapPin size={16} />{venue.location || "Location to be confirmed"}</p></div><p className="practical-description">{venue.description}</p>{httpsUrl(venue.map_url) && <a href={venue.map_url} target="_blank" rel="noopener noreferrer" className="venue-map"><img src={venue.map_url} alt={`Map for ${venue.title}`} loading="lazy" /><span>Open full map<ArrowUpRight size={14} /></span></a>}{httpsUrl(venue.directions_url) && <a className="button button-outline" href={venue.directions_url} target="_blank" rel="noopener noreferrer">Get directions<ArrowUpRight size={17} /></a>}</div></article>)}</div>}<section className="help-callout"><CircleHelp size={25} /><div><h2>A real person can help.</h2><p>{guide.settings.support_location}</p>{guide.settings.support_email && <a href={`mailto:${encodeURIComponent(guide.settings.support_email)}`}><Mail size={15} />{guide.settings.support_email}</a>}</div></section></>;
}

export function NotificationsScreen() {
  const { guide } = useApp();
  const now = useNow();
  const alerts = activeAnnouncements(guide.announcements, now);
  return <><PageTitle eyebrow="FROM THE EVENT TEAM" title="Stay in the know." description="Schedule updates, important details and things worth a heads-up." /><div className="notification-note"><Bell size={21} /><p>Event updates stay right here. You don’t need to enable browser notifications to use the app.</p></div>{!alerts.length ? <EmptyState title="You’re up to date." icon={<Bell size={29} />}>New announcements from the event team will appear here.</EmptyState> : <div className="announcement-list">{alerts.map((a) => <article className={`announcement-detail announcement-${a.severity}`} key={a.id}><span className="announcement-icon"><Zap size={21} /></span><div><div className="announcement-detail-meta"><span className="eyebrow">{a.severity === "urgent" ? "EVENT ALERT" : a.severity === "important" ? "IMPORTANT UPDATE" : "EVENT UPDATE"}</span><time dateTime={a.created_at}>{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: guide.event.timezone })}</time></div><h2>{a.title}</h2><p>{a.body}</p>{a.is_demo && <span className="sample-note">Sample announcement</span>}</div></article>)}</div>}</>;
}

export function HelpScreen() {
  const { guide } = useApp();
  return <><PageTitle eyebrow="A LITTLE HELP GOES A LONG WAY" title="You’re in good hands." description="Make the app work for you, then get back to the event." /><Onboarding restart /><div className="help-grid"><section className="help-topic"><Smartphone size={26} /><h2>Put the event in your pocket.</h2><p><strong>On iPhone:</strong> open Event Beast in Safari, tap Share, then Add to Home Screen.</p><p><strong>On Android:</strong> open your browser menu and choose Install app or Add to Home screen when available.</p><p className="fine-print">Installation is optional. You can always use the app in your browser.</p></section><section className="help-topic"><WifiOff size={26} /><h2>A little less dependent on Wi-Fi.</h2><p>Once loaded, the public agenda, sponsors, lunch, venue information and announcements can stay available offline.</p><p>Profiles, private conversations and organizer tools require a connection. A message is never marked sent until the event service confirms it.</p><a href="/offline.html" className="text-button">Open the offline guide<ArrowRight size={15} /></a></section><section className="help-topic"><ShieldCheck size={26} /><h2>Your introduction. Your choice.</h2><p>Choose whether you appear in People and whether others can message you in My Profile. Your registration email is not automatically made public.</p><p>Use conversation options to block an attendee or report a concern. Only reported messages are made available to the organizer for review.</p><Link href="/more/profile" className="text-button">Review my privacy<ArrowRight size={15} /></Link></section><section className="help-topic"><CircleHelp size={26} /><h2>Having trouble getting in?</h2><p>Create your account using the email you registered with, then verify your email. A login alone does not confirm event registration.</p><p>{guide.settings.support_location}</p>{guide.settings.support_email && <a href={`mailto:${encodeURIComponent(guide.settings.support_email)}`} className="text-button"><Mail size={16} />Contact the event team</a>}<Link href="/auth?mode=recover" className="text-button">Reset my password<ArrowRight size={15} /></Link></section></div><p className="fine-print help-event-line">{guide.event.name}{guide.event.start_date ? ` · ${eventDay(guide.event.start_date)}` : ""}{guide.mode === "demo" ? " · Sample preview" : ""}</p></>;
}

export function SponsorDetail({ id }: { id: string }) {
  const { guide } = useApp();
  const sponsor = guide.sponsors.find((s) => s.id === id);
  if (!sponsor) return <EmptyState title="This sponsor is unavailable." action={<Link href="/more/sponsors" className="button button-dark">All sponsors</Link>}>The organizer may be updating their information.</EmptyState>;
  const tier = guide.tiers.find((t) => t.id === sponsor.tier_id);
  return <div className="detail-page"><Link href="/more/sponsors" className="back-link"><ArrowLeft size={17} />All sponsors</Link><div className="sponsor-detail-hero"><span className="eyebrow">{tier?.name ?? "Event partner"} SPONSOR</span><div className="sponsor-detail-logo">{httpsUrl(sponsor.logo_url) ? <img src={sponsor.logo_url} alt={`${sponsor.name} logo`} /> : <span className="sponsor-initials">{initials(sponsor.name)}</span>}</div><h1>{sponsor.name}</h1><span className="person-city"><MapPin size={16} />{sponsor.booth || "Booth details to be announced"}</span>{sponsor.is_demo && <span className="sample-note">Sample sponsor · no real sponsor agreement is implied</span>}</div><section className="detail-section"><h2>Get to know {sponsor.name.replace(" · Sample", "")}</h2><p>{sponsor.description}</p></section>{httpsUrl(sponsor.cta_url) && <a className="button button-red" href={sponsor.cta_url} target="_blank" rel="noopener noreferrer">{sponsor.cta_label || "Learn more"}<ArrowUpRight size={17} /></a>}<SponsorRepresentatives sponsorId={id} /><SectionTitle title="Keep exploring" /><Link href="/more/sponsors" className="small-feature"><Trophy size={24} /><div><strong>Meet all the event partners</strong><span>Discover the businesses behind the momentum.</span></div><ArrowRight size={19} /></Link></div>;
}

import { useResource } from "@/lib/hooks";
import type { Profile } from "@/lib/types";
function SponsorRepresentatives({ sponsorId }: { sponsorId: string }) {
  const { me, guide } = useApp();
  const { data } = useResource<{ people: Profile[] }>(me?.eligible ? `/api/sponsors/${sponsorId}/representatives` : null);
  if (!data?.people.length) return guide.mode === "demo" ? <p className="fine-print">Sponsor representatives will appear here when the organizer links their profiles and the attendees choose directory visibility.</p> : null;
  return <section className="detail-section"><h2>Meet the team</h2>{data.people.map((p) => <Link href={`/people/${p.attendee_id}`} className="small-feature" key={p.attendee_id}><Avatar name={p.full_name} src={p.avatar_url} /><div><strong>{p.full_name}</strong><span>{p.title}</span></div><ArrowUpRight size={18} /></Link>)}</section>;
}
