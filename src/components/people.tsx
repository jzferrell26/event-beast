"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Bookmark, MapPin, MessageCircle, Search, Users, X, Mail, Phone, Globe, ShieldCheck } from "lucide-react";
import type { Profile } from "@/lib/types";
import { networkingInterests } from "@/lib/demo";
import { httpsUrl } from "@/lib/format";
import { useDebounced, useResource } from "@/lib/hooks";
import { errorMessage, mutate, request } from "@/lib/client";
import { useApp } from "./app-provider";
import { Avatar, Busy, EmptyState, ErrorState, LoadingCards, PageTitle } from "./ui";
import { ModerationActions } from "./moderation";

export function PeopleScreen() {
  const { guide } = useApp();
  const [query, setQuery] = useState("");
  const [interest, setInterest] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const debounced = useDebounced(query);
  const params = new URLSearchParams({ q: debounced, interest, saved: String(onlySaved) }).toString();
  return <><PageTitle eyebrow="THE CONNECTIONS THAT COME NEXT" title="Your kind of people." description="Find a familiar face. Meet someone who sees things differently." /><div className="directory-note"><ShieldCheck size={16} /><span>Only attendees who choose to be visible appear here.</span><Link href="/more/profile">Your privacy<ArrowUpRight size={13} /></Link></div>
    {!guide.settings.directory_enabled && guide.mode !== "demo" ? <EmptyState title="The directory is taking a break." icon={<Users size={28} />}>The organizer has paused directory access. Check back for an update.</EmptyState> : <><div className="agenda-toolbar"><label className="search-field"><Search size={20} /><input aria-label="Search attendees" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Name, company, role or city" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={18} /></button>}</label><button type="button" className={`filter-button${onlySaved ? " selected" : ""}`} aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}><Bookmark size={17} />Saved</button></div><div className="interest-filters" aria-label="Networking interests"><button type="button" className={!interest ? "active" : ""} aria-pressed={!interest} onClick={() => setInterest("")}>Everyone</button>{networkingInterests.map((name) => <button type="button" key={name} className={interest === name ? "active" : ""} aria-pressed={interest === name} onClick={() => setInterest(interest === name ? "" : name)}>{name}</button>)}</div><PeopleResults key={params} params={params} onlySaved={onlySaved} /></>}
  </>;
}
function PeopleResults({ params, onlySaved }: { params: string; onlySaved: boolean }) {
  const { guide, saved } = useApp();
  const [people, setPeople] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const active = useRef(true);
  const loading = useRef(false);
  const load = async (offset = 0) => {
    if (loading.current) return;
    loading.current = true; setBusy(true);
    try {
      const data = await request<{ people: Profile[]; hasMore: boolean }>(`/api/people?${params}&offset=${offset}`);
      if (!active.current) return;
      setPeople((prior) => offset === 0 ? data.people : [...prior, ...data.people.filter((p) => !prior.some((v) => v.attendee_id === p.attendee_id))]);
      setHasMore(data.hasMore); setError("");
    } catch (error) { if (active.current) setError(errorMessage(error)); }
    finally { loading.current = false; if (active.current) setBusy(false); }
  };
  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
    // params is captured by this keyed child instance; the parent remounts the
    // component whenever the search/filter query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visible = guide.mode === "demo" && onlySaved ? people.filter((p) => saved.attendees.includes(p.attendee_id)) : people;
  return <>{error && <ErrorState message={error} retry={() => void load(people.length)} />}{busy && !people.length ? <LoadingCards count={4} /> : !visible.length && !error ? <EmptyState title={onlySaved ? "Keep your next connection close." : "No matches just yet."} icon={<Users size={28} />}>{onlySaved ? "Bookmark an attendee to find them easily later." : "Try a different name, company or networking interest."}</EmptyState> : <><p className="results-caption">{visible.length}{hasMore ? "+" : ""} {visible.length === 1 ? "connection" : "connections"} to explore{guide.mode === "demo" ? " · Sample profiles" : ""}</p><div className="people-grid">{visible.map((person) => <PersonCard key={person.attendee_id} person={person} />)}</div>{hasMore && <button type="button" className="button button-outline load-more" disabled={busy} onClick={() => void load(people.length)}>{busy ? <Busy label="Loading…" /> : "More attendees"}</button>}</>}</>;
}
function PersonCard({ person }: { person: Profile }) {
  const { saved, toggleSave } = useApp();
  const selected = saved.attendees.includes(person.attendee_id);
  return <article className="person-card"><div className="person-top"><Link href={`/people/${person.attendee_id}`} aria-label={`View ${person.full_name}`}><Avatar name={person.full_name} src={person.avatar_url} large /></Link><button type="button" className={`icon-button bookmark-button${selected ? " is-saved" : ""}`} aria-label={`${selected ? "Unsave" : "Save"} ${person.full_name}`} aria-pressed={selected} onClick={() => void toggleSave("attendee", person.attendee_id)}><Bookmark size={19} fill={selected ? "currentColor" : "none"} /></button></div><Link href={`/people/${person.attendee_id}`} className="person-name"><h2>{person.full_name}</h2></Link><p className="person-role">{person.title || "Event attendee"}</p><p className="person-company">{person.company}</p>{(person.city || person.state) && <p className="person-city"><MapPin size={12} />{[person.city, person.state].filter(Boolean).join(", ")}</p>}<div className="person-interests">{person.interests.slice(0, 2).map((interest) => <span key={interest}>{interest}</span>)}</div><Link href={`/people/${person.attendee_id}`} className="person-link">Get to know {person.full_name.split(" ")[0]}<ArrowUpRight size={16} /></Link></article>;
}
export function PersonDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useResource<{ profile: Profile }>(`/api/people/${id}`);
  const { guide, me, saved, toggleSave, notify } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const beginConversation = async () => {
    if (guide.mode === "demo") { notify("This is a sample attendee. Explore the example conversations in Inbox."); router.push("/inbox"); return; }
    if (!me?.profile?.messaging_available) { notify("Turn on messaging in My Profile to start a conversation."); router.push("/more/profile"); return; }
    setBusy(true);
    try { const result = await mutate<{ id: string }>("/api/inbox", "POST", { recipient: id }); router.push(`/inbox/${result.id}`); }
    catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); }
  };
  if (error) return <ErrorState message={error} retry={() => void refresh()} />;
  if (loading || !data) return <LoadingCards />;
  const p = data.profile;
  const selected = saved.attendees.includes(id);
  const own = me?.attendeeId === id;
  const website = httpsUrl(p.website);
  return <div className="profile-detail"><Link href="/people" className="back-link"><ArrowLeft size={17} />Back to people</Link><section className="profile-hero"><div className="profile-cover"><span className="eyebrow">A LITTLE MORE MOMENTUM</span></div><div className="profile-summary"><Avatar name={p.full_name} src={p.avatar_url} large /><h1>{p.full_name}</h1><p>{p.title}{p.company && <> at <strong>{p.company}</strong></>}</p>{(p.city || p.state) && <span className="person-city"><MapPin size={14} />{[p.city, p.state].filter(Boolean).join(", ")}</span>}<div className="profile-actions">{own ? <Link href="/more/profile" className="button button-dark">Edit my profile</Link> : <><button className="button button-red" type="button" disabled={busy || !p.messaging_available} onClick={() => void beginConversation()}>{busy ? <Busy label="Opening…" /> : <><MessageCircle size={18} />{p.messaging_available ? "Start a conversation" : "Messaging unavailable"}</>}</button><button type="button" className="button button-outline" aria-pressed={selected} onClick={() => void toggleSave("attendee", id)}><Bookmark size={18} fill={selected ? "currentColor" : "none"} />{selected ? "Saved" : "Save"}</button></>}</div></div></section><section className="detail-section"><h2>A little about me</h2><p>{p.bio || "This attendee has not added an introduction yet."}</p></section>{p.interests.length > 0 && <section className="detail-section"><h2>Let’s talk about</h2><div className="profile-interests">{p.interests.map((interest) => <span key={interest}>{interest}</span>)}</div></section>}{(p.public_email || p.public_phone || website) && <section className="detail-section"><h2>Ways to connect</h2><div className="contact-links">{p.public_email && <a href={`mailto:${encodeURIComponent(p.public_email)}`}><Mail size={17} />{p.public_email}</a>}{p.public_phone && <a href={`tel:${p.public_phone.replace(/[^+0-9]/g, "")}`}><Phone size={17} />{p.public_phone}</a>}{website && <a href={website} target="_blank" rel="noopener noreferrer"><Globe size={17} />Visit website<ArrowUpRight size={15} /></a>}</div><p className="fine-print">Shared by this attendee, by choice.</p></section>}{!own && <ModerationActions target={id} onChange={() => router.push("/people")} />}</div>;
}
