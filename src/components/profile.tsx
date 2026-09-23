"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Camera, Eye, MessageCircle, ShieldCheck, Check, ArrowRight, Ban } from "lucide-react";
import { useApp } from "./app-provider";
import { Avatar, Busy, EmptyState, ErrorState, LoadingCards, PageTitle } from "./ui";
import type { Profile } from "@/lib/types";
import { networkingInterests, DEMO_EVENT_ID } from "@/lib/demo";
import { profileSchema } from "@/lib/validation";
import { errorMessage, mutate, request } from "@/lib/client";
import { useResource } from "@/lib/hooks";

const sampleProfile: Profile = { event_id: DEMO_EVENT_ID, attendee_id: "30000000-0000-4000-8000-000000000999", full_name: "Your name · Sample", company: "", title: "", city: "", state: "", bio: "", interests: [], headshot_path: null, public_email: "", public_phone: "", website: "", directory_visible: false, messaging_available: false };

export function ProfileScreen() {
  const { guide, me, meError, refreshMe } = useApp();
  if (guide.mode === "demo") return <ProfileForm initial={sampleProfile} />;
  if (meError) return <ErrorState message={meError} retry={() => void refreshMe()} />;
  if (!me) return <LoadingCards />;
  if (!me.eligible || !me.profile) return <EmptyState title="Your profile starts with event access." action={<Link href="/access" className="button button-dark">Check my registration<ArrowRight size={17} /></Link>}>The organizer needs to match your account to your event registration.</EmptyState>;
  return <ProfileForm key={me.attendeeId} initial={me.profile} />;
}
function ProfileForm({ initial }: { initial: Profile }) {
  const { guide, me, notify, refreshMe } = useApp();
  const [profile, setProfile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => { setProfile((prior) => ({ ...prior, [key]: value })); setSaved(false); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaved(false);
    // Database rows also contain timestamps. Send only editable profile fields.
    const fields = Object.fromEntries(Object.keys(profileSchema.shape).map((key) => [key, profile[key as keyof Profile]]));
    const result = profileSchema.safeParse(fields);
    if (!result.success) { setError(result.error.issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(". ")); return; }
    if (guide.mode === "demo") { notify("This profile is a preview. Live profile changes open when registration is connected."); return; }
    setBusy(true);
    try { await mutate("/api/profile", "PATCH", result.data); setSaved(true); await refreshMe(); notify("Your profile and privacy choices are saved."); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (guide.mode === "demo") { notify("Headshot uploads become available with live event access."); return; }
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.append("file", file); form.append("kind", "headshot");
      const result = await request<{ path: string; url: string }>("/api/uploads", { method: "POST", body: form });
      setProfile((prior) => ({ ...prior, headshot_path: result.path, avatar_url: result.url })); setSaved(false);
      notify("Photo uploaded. Save your profile to use it.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setUploading(false); }
  };
  return <><PageTitle eyebrow="MAKE YOURSELF KNOWN" title="Your introduction." description="A few good details make it easier for the right people to find you." />{guide.mode === "demo" && <p className="demo-notice">Profile preview. You can explore these controls; changes are not published or saved.</p>}<form onSubmit={save} className="profile-form"><section className="form-section"><div className="headshot-field"><Avatar name={profile.full_name} src={profile.avatar_url} large /><div><label className="button button-outline button-small upload-label"><Camera size={17} />{uploading ? "Uploading…" : "Choose a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={(e) => void upload(e.target.files?.[0])} /></label><p className="fine-print">JPG, PNG or WebP, up to 3 MB.</p>{profile.headshot_path && <button type="button" className="text-button" onClick={() => setProfile((p) => ({ ...p, headshot_path: null, avatar_url: undefined }))}>Remove photo</button>}</div></div><div className="form-grid">{([['full_name', 'Your name', 'name', 120], ['company', 'Company', 'organization', 120], ['title', 'Role / title', 'organization-title', 120], ['city', 'City', 'address-level2', 80], ['state', 'State / region', 'address-level1', 80]] as const).map(([field, label, autoComplete, max]) => <label className="form-field" key={field}><span>{label}{field === "full_name" && " *"}</span><input value={profile[field]} autoComplete={autoComplete} maxLength={max} required={field === "full_name"} onChange={(e) => update(field, e.target.value)} /></label>)}</div><label className="form-field"><span>A little about you</span><textarea value={profile.bio} maxLength={1000} rows={4} placeholder="What do you do? What would you love to talk about at the event?" onChange={(e) => update("bio", e.target.value)} /><small>{profile.bio.length}/1,000 characters</small></label></section><section className="form-section"><h2>Find some common ground.</h2><p className="form-description">Choose the topics you would like to connect over.</p><div className="profile-interest-picker">{networkingInterests.map((interest) => <button key={interest} type="button" aria-pressed={profile.interests.includes(interest)} className={profile.interests.includes(interest) ? "selected" : ""} onClick={() => update("interests", profile.interests.includes(interest) ? profile.interests.filter((i) => i !== interest) : [...profile.interests, interest])}>{profile.interests.includes(interest) && <Check size={14} />}{interest}</button>)}</div></section><section className="form-section"><h2>Your privacy, on your terms.</h2><p className="form-description">These choices are separate from your event registration.</p><label className="privacy-option"><Eye size={23} /><span><strong>Show me in the attendee directory</strong><small>Other registered attendees can see the profile details you choose to share.</small></span><input type="checkbox" checked={profile.directory_visible} onChange={(e) => update("directory_visible", e.target.checked)} /></label>{me?.directoryAllowed === false && <p className="privacy-hint">The organizer has paused visibility for your profile. Your preference is saved, but you will not appear until the organizer restores access.</p>}<label className="privacy-option"><MessageCircle size={23} /><span><strong>Let attendees message me</strong><small>Allow private conversations. You can block or report someone at any time.</small></span><input type="checkbox" checked={profile.messaging_available} onChange={(e) => update("messaging_available", e.target.checked)} /></label><p className="privacy-hint"><ShieldCheck size={15} />Your registration email is never automatically copied into your public profile.</p></section><section className="form-section"><h2>Extra ways to connect.</h2><p className="form-description">Optional. These details are visible to attendees who can view your profile.</p><div className="form-grid"><label className="form-field"><span>Contact email to share</span><input type="email" value={profile.public_email} maxLength={254} onChange={(e) => update("public_email", e.target.value)} /></label><label className="form-field"><span>Phone to share</span><input type="tel" value={profile.public_phone} maxLength={40} onChange={(e) => update("public_phone", e.target.value)} /></label><label className="form-field"><span>Website</span><input type="url" value={profile.website} placeholder="https://" onChange={(e) => update("website", e.target.value)} /></label></div></section>{error && <ErrorState message={error} />}<div className="profile-save-bar"><span>{saved ? <><Check size={16} />Saved</> : "Share only what feels right for you."}</span><button type="submit" className="button button-red" disabled={busy || uploading}>{busy ? <Busy /> : "Save my profile"}</button></div></form>{guide.mode !== "demo" && <BlockedAttendees />}</>;
}
function BlockedAttendees() {
  const { notify } = useApp();
  const { data, refresh } = useResource<{ blocks: { blocked_id: string; label: string }[] }>("/api/moderation");
  const [busy, setBusy] = useState<string | null>(null);
  if (!data?.blocks.length) return null;
  return <section className="form-section blocked-attendees"><h2>Blocked attendees</h2><p className="form-description">Unblocking allows messages again when both attendees have messaging enabled.</p>{data.blocks.map((block) => <div className="blocked-row" key={block.blocked_id}><Ban size={17} /><span>{block.label}</span><button className="button button-outline button-small" type="button" disabled={busy === block.blocked_id} onClick={async () => { setBusy(block.blocked_id); try { await mutate("/api/moderation", "POST", { action: "block", target: block.blocked_id, blocked: false }); await refresh(); } catch (error) { notify(errorMessage(error), true); } finally { setBusy(null); } }}>Unblock</button></div>)}</section>;
}
