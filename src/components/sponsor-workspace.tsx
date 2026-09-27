"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ImagePlus, MapPin, ShieldCheck, Trophy } from "lucide-react";
import type { Sponsor, SponsorTier } from "@/lib/types";
import { sponsorPageSchema } from "@/lib/roles";
import { errorMessage, mutate, request } from "@/lib/client";
import { httpsUrl } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { useApp } from "./app-provider";
import { Brand, Busy, EmptyState, ErrorState, LoadingCards, PageTitle } from "./ui";

export function SponsorShell({ children }: { children: ReactNode }) {
  const { guide, me } = useApp();
  const revoked = guide.mode !== "demo" && me && !me.isAdmin && (!me.eligible || me.role !== "sponsor");
  return <div className="sponsor-workspace">
    <a href="#sponsor-main" className="skip-link">Skip to sponsor content</a>
    <header className="sponsor-workspace-topbar">
      <Brand /><span className="workspace-badge"><Trophy size={15} />SPONSOR WORKSPACE</span>
      <Link href="/" className="button button-outline button-small">Event guide<ArrowUpRight size={16} /></Link>
    </header>
    <main id="sponsor-main" className="sponsor-workspace-main" tabIndex={-1}>
      {guide.mode === "demo" && <p className="demo-notice"><strong>DEMO SPONSOR ACCOUNT</strong> · Sample page. Explore the editor; changes are not published.</p>}
      {revoked ? <EmptyState title="Your sponsor access has changed." action={<Link href="/" className="button button-dark">Back to the event</Link>}>Contact an event admin to review your assigned pages.</EmptyState> : children}
    </main>
  </div>;
}

export function SponsorWorkspace() {
  const { data, error, loading, refresh } = useResource<{ sponsors: Sponsor[]; tiers: SponsorTier[] }>("/api/sponsor");
  return <>
    <PageTitle eyebrow="YOUR BRAND. YOUR EVENT PRESENCE." title="Make a great introduction." description="Set up your sponsor page, keep your details current, and give attendees a reason to connect." />
    <div className="sponsor-access-note"><ShieldCheck size={20} /><p>You can edit the pages assigned to your account. Event admins manage sponsor tiers, featured placements and publication.</p></div>
    {error && <ErrorState message={error} retry={() => void refresh()} />}
    {loading ? <LoadingCards count={2} /> : data && !data.sponsors.length ? <EmptyState title="Your sponsor page is on its way." icon={<Trophy size={28} />}>An event admin needs to assign a sponsor page to your account.</EmptyState> : <div className="sponsor-workspace-grid">
      {data?.sponsors.map((sponsor) => <article className="sponsor-workspace-card" key={sponsor.id}>
        <div className="sponsor-workspace-card-head"><span className="role-chip role-sponsor">Sponsor</span><span className={`page-status ${sponsor.published ? "status-live" : ""}`}>{sponsor.published ? "Page published" : "Page in preparation"}</span></div>
        <div className="sponsor-workspace-wordmark">{httpsUrl(sponsor.logo_url) ? <img src={sponsor.logo_url} alt={`${sponsor.name} logo`} /> : sponsor.name.replace(" · Sample", "")}</div>
        <p className="eyebrow">{data.tiers.find((t) => t.id === sponsor.tier_id)?.name ?? "Event partner"}</p>
        <h2>{sponsor.name}</h2><p>{sponsor.description}</p>
        <Link className="button button-dark button-full" href={`/sponsor/${sponsor.id}`}>Edit your sponsor page<ArrowRight size={17} /></Link>
      </article>)}
    </div>}
  </>;
}

export function SponsorPageEditor({ id }: { id: string }) {
  const { data, error, loading, refresh } = useResource<{ sponsor: Sponsor; tiers: SponsorTier[] }>(`/api/sponsor/${id}`);
  if (error) return <ErrorState message={error} retry={() => void refresh()} />;
  if (loading || !data) return <LoadingCards />;
  return <SponsorForm key={id} initial={data.sponsor} tiers={data.tiers} />;
}

function SponsorForm({ initial, tiers }: { initial: Sponsor; tiers: SponsorTier[] }) {
  const { guide, notify } = useApp();
  const [record, setRecord] = useState(initial);
  const [values, setValues] = useState(() => sponsorPageSchema.parse(Object.fromEntries(Object.keys(sponsorPageSchema.shape).map((key) => [key, initial[key as keyof Sponsor]]))));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const tier = tiers.find((t) => t.id === record.tier_id)?.name ?? "Event partner";
  const update = (key: keyof typeof values, value: string) => { setValues((previous) => ({ ...previous, [key]: value })); setDirty(true); setSaved(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (guide.mode === "demo") { notify("This is a sponsor preview. No page content has been published."); return; }
    setBusy(true);
    try {
      const valid = sponsorPageSchema.parse(values);
      const result = await mutate<{ saved: boolean; sponsor: Sponsor }>(`/api/sponsor/${record.id}`, "PATCH", { expected_version: record.content_version ?? 0, values: valid });
      setRecord(result.sponsor); setDirty(false); setSaved(true); notify("Your sponsor page is saved.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (guide.mode === "demo") { notify("Logo uploads open when your live sponsor account is connected."); return; }
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.append("file", file); form.append("kind", "sponsor"); form.append("sponsor_id", record.id);
      const result = await request<{ url: string }>("/api/uploads", { method: "POST", body: form }); update("logo_url", result.url);
      notify("Logo uploaded. Save your page to use it.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setUploading(false); }
  };
  return <>
    <Link href="/sponsor" className="back-link"><ArrowLeft size={16} />Your sponsor pages</Link>
    <PageTitle eyebrow="SPONSOR PAGE EDITOR" title="Put your best page forward." description="Update your introduction, logo and contact link. The preview updates as you type." />
    <div className="sponsor-editor-grid">
      <form onSubmit={submit} className="sponsor-editor-form">
        <section className="form-section"><h2>Your introduction</h2>
          <label className="form-field"><span>Sponsor name</span><input required maxLength={120} value={values.name} onChange={(e) => update("name", e.target.value)} /></label>
          <label className="form-field"><span>About your company</span><textarea rows={5} maxLength={3000} value={values.description} onChange={(e) => update("description", e.target.value)} /><small>{values.description.length}/3,000 characters</small></label>
          <label className="form-field"><span>Booth / location</span><input maxLength={240} value={values.booth} onChange={(e) => update("booth", e.target.value)} /></label>
        </section>
        <section className="form-section"><h2>Make it recognizable</h2><p className="form-description">Use your company logo so attendees know they are in the right place.</p>
          <label className="sponsor-logo-upload"><ImagePlus size={25} /><span><strong>{uploading ? "Uploading your logo…" : "Upload your logo"}</strong><small>JPG, PNG or WebP · up to 3 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={(e) => void upload(e.target.files?.[0])} /></label>
          <label className="form-field"><span>Or use a public logo link</span><input type="url" placeholder="https://" value={values.logo_url} onChange={(e) => update("logo_url", e.target.value)} /></label>
        </section>
        <section className="form-section"><h2>Give them a next step</h2>
          <label className="form-field"><span>Button label</span><input maxLength={80} placeholder="Visit our website" value={values.cta_label} onChange={(e) => update("cta_label", e.target.value)} /></label>
          <label className="form-field"><span>Website / contact link</span><input type="url" placeholder="https://" value={values.cta_url} onChange={(e) => update("cta_url", e.target.value)} /></label>
        </section>
        {error && <ErrorState message={error} />}
        <div className="sponsor-save-row"><span aria-live="polite">{saved ? <><Check size={16} />Saved</> : dirty ? "Unsaved changes" : "Your page details"}</span><button className="button button-red" type="submit" disabled={busy || uploading}>{busy ? <Busy /> : guide.mode === "demo" ? "Preview save" : "Save sponsor page"}</button></div>
      </form>
      <aside className="sponsor-editor-preview"><div className="preview-label"><span className="eyebrow">ATTENDEE PAGE PREVIEW</span><span className="role-chip role-sponsor">{tier}</span></div>
        <div className="sponsor-preview-page"><div className="sponsor-preview-brand">{httpsUrl(values.logo_url) ? <img src={values.logo_url} alt={`${values.name} logo preview`} /> : <span>{values.name.replace(" · Sample", "") || "Your company"}</span>}</div>
          <div className="sponsor-preview-copy"><span className="eyebrow">{tier} SPONSOR</span><h2>{values.name || "Your sponsor name"}</h2><p className="sponsor-preview-location"><MapPin size={15} />{values.booth || "Location to be announced"}</p><p className="sponsor-preview-description">{values.description || "Your company introduction will appear here."}</p>
            {httpsUrl(values.cta_url) ? <a className="button button-dark button-full" href={values.cta_url} target="_blank" rel="noopener noreferrer">{values.cta_label || "Learn more"}<ArrowUpRight size={17} /></a> : <div className="sponsor-preview-placeholder">Add a link to give attendees a next step.</div>}
          </div>
        </div>
        <div className="sponsor-preview-status"><ShieldCheck size={18} /><p><strong>{record.published ? "Your page is published." : "Your page is in preparation."}</strong> Your event admin controls publication, sponsorship tier and featured placements.</p></div>
        {record.published && <Link className="text-button" href={`/more/sponsors/${record.id}`} target="_blank">Open attendee page<ArrowUpRight size={15} /></Link>}
      </aside>
    </div>
  </>;
}
