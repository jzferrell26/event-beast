"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleHelp, ClipboardCheck, ClipboardCopy, FileUp, Flag, LayoutDashboard, MapPin, Megaphone, Plus, Search, Settings2, ShieldCheck, Trophy, Users, Utensils, X } from "lucide-react";
import { adminDefaults, adminSaveValues, adminImageField, adminImageLabel, adminImageUploadError, adminResources, getAdminResource, instantToWall, wallToInstant, type AdminField, type AdminResource } from "@/lib/admin-resources";
import { errorMessage, mutate, request } from "@/lib/client";
import { useDebounced, useResource } from "@/lib/hooks";
import { ImportDialog } from "./attendee-import";
import { useApp } from "./app-provider";
import { Brand, Busy, EmptyState, ErrorState, LoadingCards, Modal, PageTitle } from "./ui";
import { AdminSessionSpeakers } from "./admin-session-speakers";
import { SponsorCreative } from './sponsor-creative';
import { DescriptionEditor } from './description-editor';
import { SignOutButton } from './sign-out';

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/launch", label: "Launch readiness", icon: ClipboardCheck },
  { href: "/admin/event_settings", label: "Welcome & settings", icon: Settings2 },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/feed", label: "Social wall", icon: Flag },
  { href: "/admin/event_activities", label: "Fun Stuff", icon: CalendarDays },
  { href: "/admin/agenda_sessions", label: "Agenda", icon: CalendarDays },
  { href: "/admin/attendees", label: "Attendees", icon: Users },
  { href: "/admin/users", label: "Users & roles", icon: ShieldCheck },
  { href: "/admin/sponsors", label: "Sponsors", icon: Trophy },
  { href: "/admin/lunch_locations", label: "Lunch", icon: Utensils },
  { href: "/admin/venue_locations", label: "Venue", icon: MapPin },
  { href: "/admin/reports", label: "Reports", icon: Flag },
];
const agendaSections = ["agenda_days", "agenda_sessions", "speakers", "session_speakers"];
const sponsorSections = ["sponsors", "sponsor_tiers", "agenda_sponsor_placements", "sponsor_representatives"];

export function AdminShell({ children }: { children: ReactNode }) {
  const { guide } = useApp();
  const path = usePathname();
  const current = path.split("/")[2] ?? "";
  return <div className="admin-shell"><a href="#admin-main" className="skip-link">Skip to organizer content</a><header className="admin-topbar"><Brand /><span className="admin-label">ORGANIZER CONSOLE</span><Link href="/" className="button button-outline button-small">View attendee app<ArrowUpRight size={15} /></Link><SignOutButton compact /></header><div className="admin-body"><aside className="admin-sidebar"><div className="admin-event-label"><span className="eyebrow">YOUR EVENT</span><strong>{guide.event.name}</strong></div><nav aria-label="Organizer navigation">{adminNav.filter(item => item.href !== "/admin/announcements" || guide.settings.announcements_enabled !== false).map(({ href, label, icon: Icon }) => { const active = path === href || (href === "/admin/agenda_sessions" && agendaSections.includes(current)) || (href === "/admin/sponsors" && sponsorSections.includes(current)); return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={18} /><span>{label}</span></Link>; })}</nav><div className="organizer-help"><ShieldCheck size={20} /><p>Changes stay within this event. Attendee privacy choices remain theirs.</p></div></aside><main id="admin-main" className="admin-main" tabIndex={-1}>{guide.mode === "demo" && <div className="admin-demo"><span>DEMO CONSOLE</span><p>Explore the tools and preview imports. Changes are not written to a live event.</p></div>}{children}</main></div></div>;
}

interface Overview { registered: number; approved: number; linked: number; sessions: number; sponsors: number; reports: number; published: boolean; demo: boolean }
export function AdminOverview() {
  const { guide } = useApp();
  const { data, error, loading, refresh } = useResource<Overview>("/api/admin/overview");
  const [edit, setEdit] = useState(false);
  const cards = [{ title: "Your attendee roster", description: "Import registrations, resolve access and manage directory eligibility.", href: "/admin/attendees", icon: Users }, { title: "A great agenda", description: "Build event days, add sessions and connect the right speakers.", href: "/admin/agenda_sessions", icon: CalendarDays }, { title: "The partners behind it", description: "Manage sponsor tiers, profiles and agenda placements.", href: "/admin/sponsors", icon: Trophy }, guide.settings.announcements_enabled !== false ? { title: "Keep everyone informed", description: "Publish announcements and the welcome message attendees see first.", href: "/admin/announcements", icon: Megaphone } : { title: "Look after the conversation", description: "Review social wall posts and attendee reports.", href: "/admin/feed", icon: Flag }];
  return <><PageTitle eyebrow="MAKE THE EXPERIENCE EXCELLENT" title="Set the event in motion." description="One place for the details that keep the day running well." action={<button className="button button-dark" type="button" onClick={() => setEdit(true)}><Settings2 size={17} />Event details</button>} />{error && <ErrorState message={error} retry={() => void refresh()} />}{loading ? <LoadingCards count={2} /> : data && <><div className="admin-stats">{[{ label: "Registered attendees", value: data.registered, detail: `${data.linked} accounts connected`, href: "/admin/attendees" }, { label: "Published sessions", value: data.sessions, detail: "Ready in the agenda", href: "/admin/agenda_sessions" }, { label: "Published sponsors", value: data.sponsors, detail: "Event partners", href: "/admin/sponsors" }, { label: "Open reports", value: data.reports, detail: data.reports ? "Ready for review" : "Nothing waiting", href: "/admin/reports" }].map((metric) => <Link href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}<ArrowUpRight size={13} /></small></Link>)}</div><div className="event-publication"><span className={data.published ? "publication-dot published" : "publication-dot"} /><div><strong>{data.published ? "The public event guide is published" : "The event guide is still in preparation"}</strong><p>{data.demo ? "This preview contains clearly labeled sample content." : `${data.approved} attendees currently have approved access. Times are managed in ${guide.event.timezone}.`}</p></div><Link href="/" aria-label="View event guide"><ArrowUpRight size={21} /></Link></div></>}
    <div className="admin-work-grid">{cards.map(({ title, description, href, icon: Icon }) => <Link href={href} key={href}><Icon size={27} /><h2>{title}</h2><p>{description}</p><span>Open section<ArrowRight size={16} /></span></Link>)}</div><div className="organizer-launch-note"><CircleHelp size={24} /><div><h2>Before you open the doors.</h2><p>Replace sample content with confirmed details. Check the agenda on a phone, review sponsor order, import the registration roster and test attendee sign-in before sharing the app.</p></div></div><Modal open={edit} onOpenChange={setEdit} title="Event details" description={`Event times use ${guide.event.timezone}. Publishing makes the public guide available to everyone with the link.`}><EventDetailsForm onSaved={() => { setEdit(false); void refresh(); }} /></Modal></>;
}
function EventDetailsForm({ onSaved }: { onSaved: () => void }) {
  const { guide, notify, refreshGuide } = useApp();
  const [values, setValues] = useState({ name: guide.event.name, tagline: guide.event.tagline, start_date: guide.event.start_date, end_date: guide.event.end_date, published: guide.event.published, is_demo: guide.event.is_demo });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await mutate("/api/admin/overview", "PATCH", values); await refreshGuide(); notify("Event details saved."); onSaved(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    <label className="form-field"><span>Event name</span><input value={values.name} required maxLength={160} onChange={(e) => setValues({ ...values, name: e.target.value })} /></label>
    <label className="form-field"><span>Tagline</span><input value={values.tagline} maxLength={300} onChange={(e) => setValues({ ...values, tagline: e.target.value })} /></label>
    <div className="form-grid">
      <label className="form-field"><span>First event date</span><input type="date" value={values.start_date ?? ""} onChange={(e) => setValues({ ...values, start_date: e.target.value || null })} /></label>
      <label className="form-field"><span>Last event date</span><input type="date" value={values.end_date ?? ""} onChange={(e) => setValues({ ...values, end_date: e.target.value || null })} /></label>
    </div>
    <label className="admin-checkbox"><input type="checkbox" checked={values.is_demo} onChange={(e) => setValues({ ...values, is_demo: e.target.checked })} /><span>This event uses a sample program</span></label>
    <p className="fine-print">Turn off the sample marker only after replacing the example program with organizer-confirmed details. Individual sample records remain flagged separately.</p>
    <label className="admin-checkbox"><input type="checkbox" checked={values.published} onChange={(e) => setValues({ ...values, published: e.target.checked })} /><span>Publish the public event guide</span></label>
    {error && <ErrorState message={error} />}
    <div className="dialog-actions"><button className="button button-red" type="submit" disabled={busy}>{busy ? <Busy /> : "Save event details"}</button></div>
  </form>;
}

type Row = Record<string, unknown>;
type Lookups = Record<string, { id: string; label: string; day_id?: string; published?: boolean }[]>;
function recordLabel(row: Row, definition: AdminResource, lookups: Lookups, subtitle = false): string {
  const key = subtitle ? definition.subtitleField : definition.titleField;
  if (!key) return "";
  const field = definition.fields.find((f) => f.key === key);
  const value = row[key];
  if (field?.source) return lookups[field.source]?.find((item) => item.id === value)?.label ?? "Linked record";
  return String(value ?? "").trim() || (subtitle ? "" : definition.singular);
}
export function AdminContent({ resource }: { resource: string }) {
  const definition = getAdminResource(resource);
  if (!definition) return <EmptyState title="Section not found." />;
  return <ContentManager key={resource} resource={resource} definition={definition} />;
}
function ContentManager({ resource, definition }: { resource: string; definition: AdminResource }) {
  const { notify, guide, refreshGuide } = useApp();
  const [offset, setOffset] = useState(0);
  const { data, error, loading, refresh } = useResource<{ rows: Row[]; hasMore: boolean }>(`/api/admin/content/${resource}?offset=${offset}`);
  const lookups = useResource<Lookups>("/api/admin/lookups");
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [rowUpload, setRowUpload] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const imageField = adminImageField(definition);
  const group = agendaSections.includes(resource) ? agendaSections : sponsorSections.includes(resource) ? sponsorSections : null;
  const title = recordLabel;
  const finish = () => { setOpen(false); void refresh(); void lookups.refresh(); void refreshGuide(); notify("Your changes are saved."); };
  const uploadRowImage = async (row: Row, file?: File) => {
    if (!file || !imageField) return;
    if (guide.mode === "demo") { notify("Image uploads open when the live event is connected."); return; }
    const validationError = adminImageUploadError(file);
    if (validationError) { setUploadError(validationError); return; }
    setRowUpload(String(row.id)); setUploadError("");
    try {
      const data = new FormData(); data.append("kind", "asset"); data.append("file", file);
      const result = await request<{ url: string }>("/api/uploads", { method: "POST", body: data });
      await mutate(`/api/admin/content/${resource}`, "PATCH", { id: row.id, url: result.url });
      void refresh(); void refreshGuide();
      notify(imageField.key === "logo_url" ? "Logo saved." : imageField.key === 'image_url' ? 'Image saved.' : "Photo saved.");
    } catch (error) { setUploadError(errorMessage(error)); }
    finally { setRowUpload(null); }
  };
  return <><PageTitle eyebrow="ORGANIZER TOOLS" title={definition.title} description={definition.description} action={!definition.singleton && <button type="button" className="button button-dark" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17} />Add {definition.singular.toLowerCase()}</button>} />{group && <nav className="admin-subnav" aria-label="Related organizer sections">{group.map((section) => <Link href={`/admin/${section}`} key={section} className={section === resource ? "active" : ""}>{adminResources[section].title}</Link>)}</nav>}
    {error && <ErrorState message={error} retry={() => void refresh()} />}{uploadError && <ErrorState message={uploadError} />}{lookups.error && <ErrorState message={lookups.error} retry={() => void lookups.refresh()} />}
    {loading ? <LoadingCards count={3} /> : definition.singleton ? <div className="settings-preview"><span className="eyebrow">WHAT ATTENDEES SEE FIRST</span><h2>{String(data?.rows[0]?.welcome_title ?? "Welcome to your event")}</h2><p>{String(data?.rows[0]?.welcome_body ?? "")}</p><div className="settings-status"><span><CheckCircle2 size={15} />Directory {data?.rows[0]?.directory_enabled ? "enabled" : "paused"}</span><span><CheckCircle2 size={15} />Messaging {data?.rows[0]?.messaging_enabled ? "enabled" : "paused"}</span></div><button className="button button-red" type="button" onClick={() => { setEditing(data?.rows[0] ?? {}); setOpen(true); }}>Edit welcome & settings<ArrowRight size={17} /></button></div> : !data?.rows.length && !error ? <EmptyState title={`Your ${definition.title.toLowerCase()} start here.`} action={<button className="button button-dark" type="button" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17} />Add {definition.singular.toLowerCase()}</button>}>{definition.description}</EmptyState> : <div className="admin-record-list">{data?.rows.map((row) => <article key={String(row.id)}><div className="admin-record-copy"><div className="record-badges">{typeof row.published === "boolean" && <span className={row.published ? "published-badge" : "draft-badge"}>{row.published ? "Published" : "Draft"}</span>}{Boolean(row.is_demo) && <span className="sample-badge">Sample</span>}</div><h2>{title(row, definition, lookups.data ?? {})}</h2>{definition.subtitleField && <p>{title(row, definition, lookups.data ?? {}, true)}</p>}{row.import_note != null && <ImportSourceNote value={row.import_note} />}{typeof row.starts_at === "string" && <small>{instantToWall(row.starts_at, guide.event.timezone).replace("T", " · ")} · {guide.event.timezone}</small>}</div><div className="record-actions">{imageField && <label className="button button-outline button-small list-upload"><FileUp size={15} />{rowUpload === String(row.id) ? "Uploading…" : adminImageLabel(imageField)}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${adminImageLabel(imageField)} for ${title(row, definition, lookups.data ?? {})}`} disabled={Boolean(rowUpload)} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void uploadRowImage(row, file); }} /></label>}<button type="button" className="button button-outline button-small" onClick={() => { setEditing(row); setOpen(true); }}>Edit</button>{resource === "agenda_sponsor_placements" && <button type="button" className="button button-outline button-small" onClick={() => { setEditing({...adminSaveValues(definition,row),published:false,sort_order:Math.min(100000,Number(row.sort_order ?? 100)+10)}); setOpen(true); }}>Copy placement</button>}<button type="button" className="text-button muted" onClick={() => { setRemoveError(""); setDeleting(row); }}>Remove</button></div></article>)}</div>}
    {(offset > 0 || data?.hasMore) && <div className="pagination"><button className="button button-outline button-small" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><span>Page {Math.floor(offset / 50) + 1}</span><button className="button button-outline button-small" type="button" disabled={!data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</button></div>}
    <Modal open={open} onOpenChange={setOpen} title={`${editing && (editing.id || definition.singleton) ? "Edit" : "Add"} ${definition.singular.toLowerCase()}`} description={`Changes apply to this event. All clock times use ${guide.event.timezone}.`}><ResourceEditor key={`${resource}:${editing?.id ?? editing?.event_id ?? "new"}:${open}`} resource={resource} definition={definition} existing={editing} lookups={lookups.data ?? {}} lookupsReady={Boolean(lookups.data) && !lookups.error} onSaved={finish} /></Modal>
    <Modal open={Boolean(deleting)} onOpenChange={(value) => { if (!value && !busy) setDeleting(null); }} title={`Remove this ${definition.singular.toLowerCase()}?`} description="Linked content can prevent removal. Unpublishing is a good option when you want to keep a record for later.">{deleting && <strong className="delete-label">{title(deleting, definition, lookups.data ?? {})}</strong>}{removeError && <ErrorState message={removeError} />}<div className="dialog-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setDeleting(null)}>Keep it</button><button type="button" className="button button-red" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); setRemoveError(""); try { await mutate(`/api/admin/content/${resource}`, "DELETE", { id: deleting.id }); setDeleting(null); void refresh(); void refreshGuide(); notify("Record removed."); } catch (error) { setRemoveError(errorMessage(error)); } finally { setBusy(false); } }}>{busy ? <Busy /> : "Remove record"}</button></div></Modal>
  </>;
}
function ImportSourceNote({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const note = value as { source_sheet?: string; source_row?: number; issue?: string };
  return <p className="admin-import-note">Source: {note.source_sheet}, row {note.source_row}{note.issue ? ` · Import note: ${note.issue}` : ""}</p>;
}

function ResourceEditor({ resource, definition, existing, lookups, lookupsReady, onSaved }: { resource: string; definition: AdminResource; existing: Row | null; lookups: Lookups; lookupsReady: boolean; onSaved: () => void }) {
  const { guide, notify } = useApp();
  const [values, setValues] = useState<Row>(() => Object.fromEntries(definition.fields.map((field) => { const value = existing?.[field.key] ?? adminDefaults(definition)[field.key]; return [field.key, field.kind === "datetime" && typeof value === "string" && value ? instantToWall(value, guide.event.timezone) : value]; })));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [speakerIds, setSpeakerIds] = useState<string[]>(() => Array.isArray(existing?.speaker_ids) ? existing.speaker_ids.filter((id): id is string => typeof id === "string") : []);
  const sessionForm = resource === "agenda_sessions";
  const speakersReady = lookupsReady && (!existing?.id || Array.isArray(existing.speaker_ids));
  const reviewNote = existing?.import_note as { issue?: string; review_status?: string } | null | undefined;
  const update = (field: AdminField, value: unknown) => setValues((prior) => ({ ...prior, [field.key]: value, ...(field.key === "day_id" && resource === "agenda_sponsor_placements" ? { after_session_id: null } : {}), ...(field.key === 'surface' && value !== 'agenda' ? { day_id: null, after_session_id: null } : {}) }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sessionForm && !speakersReady) { setError("Reload the session and speaker choices before saving. No changes were sent."); return; }
    setBusy(true); setError("");
    try {
      const payload = Object.fromEntries(definition.fields.map((field) => {
        const value = values[field.key];
        return [field.key, field.kind === "datetime" ? value ? wallToInstant(String(value), guide.event.timezone) : null : field.nullable && !value ? null : value];
      }));
      await mutate(`/api/admin/content/${resource}`, "POST", { ...(existing?.id ? { id: existing.id } : {}), values: payload, ...(sessionForm ? { speaker_ids: speakerIds } : {}) }); onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const upload = async (field: AdminField, file?: File) => {
    if (!file) return;
    if (guide.mode === "demo") { notify("Public asset uploads open when the live event is connected."); return; }
    const validationError = adminImageUploadError(file);
    if (validationError) { setError(validationError); return; }
    setUploading(field.key); setError("");
    try { const data = new FormData(); data.append("kind", "asset"); data.append("file", file); const result = await request<{ url: string }>("/api/uploads", { method: "POST", body: data }); update(field, result.url); }
    catch (error) { setError(errorMessage(error)); }
    finally { setUploading(null); }
  };
  return <form onSubmit={submit} className="resource-editor"><fieldset className="admin-form-fields" disabled={busy || Boolean(uploading)}>{definition.fields.map((field) => {
    if (resource === 'agenda_sponsor_placements' && values.surface !== 'agenda' && ['day_id', 'after_session_id'].includes(field.key)) return null;
    const value = values[field.key];
    if (sessionForm && field.key === "session_type" && guide.publicSite) return null;
    if (sessionForm && field.key === "description") return <DescriptionEditor key={field.key} label={field.label} value={String(value ?? "")} maxLength={field.max ?? 5000} required={field.required} onChange={next => update(field,next)} />;
    if (field.kind === "boolean") return <label className="admin-checkbox" key={field.key}><input type="checkbox" checked={Boolean(value)} onChange={(e) => update(field, e.target.checked)} /><span>{field.label}</span></label>;
    const options = field.source ? (lookups[field.source] ?? []).filter((item) => field.key !== "after_session_id" || !values.day_id || item.day_id === values.day_id) : (field.options ?? []).map((v) => ({ id: v, label: v }));
    return <label className="form-field" key={field.key}><span>{field.label}{field.required && " *"}</span>{field.kind === "textarea" ? <textarea rows={4} maxLength={field.max} required={field.required} value={String(value ?? "")} onChange={(e) => update(field, e.target.value)} /> : field.kind === "select" ? <select required={field.required} value={String(value ?? "")} onChange={(e) => update(field, e.target.value || (field.nullable ? null : ""))}>{(field.nullable || field.source) && <option value="">{field.nullable ? "None / not set" : "Choose one"}</option>}{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select> : <input type={field.kind === "datetime" ? "datetime-local" : field.kind === "number" ? "number" : field.kind} value={String(value ?? "")} min={field.kind === "number" ? 0 : undefined} max={field.kind === "number" ? 100000 : undefined} maxLength={field.max} required={field.required} onChange={(e) => update(field, field.kind === "number" ? Number(e.target.value) : e.target.value)} />}{field.help && <small>{field.help}</small>}{field.kind === "url" && /logo|headshot|image|map/.test(field.key) && <span className="asset-upload"><FileUp size={15} /><span>{uploading === field.key ? "Uploading…" : field.key === "headshot_url" || field.key === "logo_url" ? adminImageLabel(field) : "Upload image"}</span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label={field.key === "headshot_url" || field.key === "logo_url" ? adminImageLabel(field) : "Upload image"} disabled={Boolean(uploading)} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void upload(field, file); }} /></span>}</label>;
  })}{sessionForm && <AdminSessionSpeakers choices={lookups.speakers ?? []} selected={speakerIds} ready={speakersReady} onChange={setSpeakerIds} />}</fieldset>{resource === 'agenda_sponsor_placements' && <><SponsorCreative key={String(values.image_url)} preview sponsorName={lookups.sponsors?.find(sponsor => sponsor.id === values.sponsor_id)?.label ?? 'Selected sponsor'} placement={{ image_url: String(values.image_url ?? ''), image_alt: String(values.image_alt ?? ''), image_format: values.image_format === 'square' ? 'square' : 'banner', headline: String(values.headline ?? ''), body: String(values.body ?? '') }} /><p className="creative-preview-note">Upload sets the image in this form. Select Save changes to persist it. {values.surface === 'agenda' ? 'Published ads appear on the selected day, after the selected session; leave the session unset to place the ad at the start of the day.' : 'Published ads appear on the selected page, in display order. Page advertisements do not need an agenda day or session.'} Banner images keep their original proportions; square previews fit the whole image without cropping.</p></>}{sessionForm && reviewNote?.issue && <div className="session-review-notice"><strong>Source question: {reviewNote.issue}</strong><p>Changing session details sends a confirmed or excluded decision back to review. After saving, check <Link href="/admin/launch">Launch readiness</Link> before opening the event.</p></div>}{error && <ErrorState message={error} />}<div className="dialog-actions"><button type="submit" className="button button-red" disabled={busy || Boolean(uploading) || (sessionForm && !speakersReady)}>{busy ? <Busy /> : "Save changes"}</button></div></form>;
}

interface AttendeeRow { id: string; registration_name: string; registration_email: string; status: "approved" | "pending" | "disabled"; directory_allowed: boolean; user_id: string | null }
export function AdminAttendees() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const debounced = useDebounced(query);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  return <><PageTitle eyebrow="REGISTRATION & ACCESS" title="The people coming together." description="Registration controls event access. Attendees choose their own profile visibility." action={<button className="button button-dark" type="button" onClick={() => setImportOpen(true)}><FileUp size={17} />Import attendees</button>} /><div className="admin-roster-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search registrations" placeholder="Name or registration email" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear registration search"><X size={17} /></button>}</label><select aria-label="Filter registration status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All access states</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="disabled">Disabled</option></select></div><AttendeeRoster key={`${debounced}:${status}:${refreshKey}`} query={debounced} status={status} /><ImportDialog open={importOpen} setOpen={setImportOpen} onImported={() => setRefreshKey((key) => key + 1)} /></>;
}
function AttendeeRoster({ query, status }: { query: string; status: string }) {
  const { notify } = useApp();
  const [offset, setOffset] = useState(0);
  const { data, error, loading, refresh } = useResource<{ rows: AttendeeRow[]; hasMore: boolean }>(`/api/admin/attendees?${new URLSearchParams({ q: query, status, offset: String(offset) })}`);
  const [editing, setEditing] = useState<AttendeeRow | null>(null);
  return <>{error && <ErrorState message={error} retry={() => void refresh()} />}{loading ? <LoadingCards /> : !data?.rows.length ? <EmptyState title="No matching registrations." icon={<Users size={28} />}>Import your roster or try another search.</EmptyState> : <div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>Attendee</th><th>Event access</th><th>Account</th><th>Directory allowed</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><strong>{row.registration_name}</strong><span>{row.registration_email}</span></td><td><span className={`access-badge badge-${row.status}`}>{row.status}</span></td><td>{row.user_id ? "Connected" : "Not claimed"}</td><td>{row.directory_allowed ? "Yes, with consent" : "Paused"}</td><td><button className="button button-outline button-small" type="button" onClick={() => setEditing(row)}>Manage</button></td></tr>)}</tbody></table></div>}{(offset > 0 || data?.hasMore) && <div className="pagination"><button className="button button-outline button-small" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><span>Page {offset / 50 + 1}</span><button className="button button-outline button-small" type="button" disabled={!data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</button></div>}<Modal open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Manage attendee access" description="These controls affect registration and access. They do not publish an attendee’s private profile.">{editing && <AttendeeEditor key={editing.id} attendee={editing} onSaved={() => { setEditing(null); void refresh(); notify("Attendee access updated."); }} />}</Modal></>;
}
function AttendeeEditor({ attendee, onSaved }: { attendee: AttendeeRow; onSaved: () => void }) {
  const { notify } = useApp();
  const [values, setValues] = useState(attendee);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await mutate("/api/admin/attendees", "PATCH", { id: values.id, registration_name: values.registration_name, registration_email: values.registration_email, status: values.status, directory_allowed: values.directory_allowed }); onSaved(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}><label className="form-field"><span>Registration name</span><input value={values.registration_name} required maxLength={120} onChange={(e) => setValues({ ...values, registration_name: e.target.value })} /></label><label className="form-field"><span>Registration email</span><input type="email" value={values.registration_email} required maxLength={254} readOnly={Boolean(values.user_id)} onChange={(e) => setValues({ ...values, registration_email: e.target.value })} /><small>{values.user_id ? "This registration is linked to a verified account. Email reassignment is restricted." : "The attendee must verify this email to claim access."}</small></label><label className="form-field"><span>Event access</span><select value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as AttendeeRow["status"] })}><option value="approved">Approved</option><option value="pending">Pending approval</option><option value="disabled">Disabled</option></select><small>Disabling access stops private directory, messaging and headshot access.</small></label><label className="admin-checkbox"><input type="checkbox" checked={values.directory_allowed} onChange={(e) => setValues({ ...values, directory_allowed: e.target.checked })} /><span>Allow directory participation when the attendee opts in</span></label><button type="button" className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/auth?mode=sign-up`); notify("Sign-up link copied. Share it through your registration communication channel."); } catch { notify("The browser could not copy the link. Use the app’s sign-up page.", true); } }}><ClipboardCopy size={15} />Copy attendee sign-up link</button>{error && <ErrorState message={error} />}<div className="dialog-actions"><button className="button button-red" type="submit" disabled={busy}>{busy ? <Busy /> : "Save access changes"}</button></div></form>;
}

interface ReportRow { id: string; reason: string; status: string; created_at: string; reporter_name: string; target_name: string; target_id: string; reported_message: string | null }
export function AdminReports() {
  const { notify } = useApp();
  const [offset, setOffset] = useState(0);
  const { data, error, loading, refresh } = useResource<{ rows: ReportRow[]; hasMore: boolean }>(`/api/admin/reports?offset=${offset}`);
  const [busy, setBusy] = useState<string | null>(null);
  return <><PageTitle eyebrow="LOOK AFTER YOUR ATTENDEES" title="A place for concerns." description="Review reports with care. Only explicitly reported messages are included." />{error && <ErrorState message={error} retry={() => void refresh()} />}{loading ? <LoadingCards /> : !data?.rows.length ? <EmptyState title="Nothing waiting for review." icon={<ShieldCheck size={31} />}>Attendee reports will appear here. Private conversations remain private unless an attendee reports a message.</EmptyState> : <div className="report-list">{data.rows.map((report) => <article className="report-card" key={report.id}><div className="report-heading"><span className={report.status === "open" ? "draft-badge" : "published-badge"}>{report.status}</span><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString()}</time></div><h2>{report.target_name}</h2><p className="report-subtitle">Reported by {report.reporter_name}</p><p className="report-reason">{report.reason}</p>{report.reported_message && <blockquote><span>Reported message</span>{report.reported_message}</blockquote>}<div className="report-actions"><Link href="/admin/attendees" className="text-button">Manage attendee access<ArrowUpRight size={15} /></Link><select aria-label={`Status for report about ${report.target_name}`} value={report.status} disabled={busy === report.id} onChange={async (e) => { setBusy(report.id); try { await mutate("/api/admin/reports", "PATCH", { id: report.id, status: e.target.value }); await refresh(); notify("Report status updated."); } catch (error) { notify(errorMessage(error), true); } finally { setBusy(null); } }}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option></select></div></article>)}</div>}{(offset > 0 || data?.hasMore) && <div className="pagination"><button className="button button-outline button-small" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><span>Page {offset / 50 + 1}</span><button className="button button-outline button-small" type="button" disabled={!data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</button></div>}</>;
}
