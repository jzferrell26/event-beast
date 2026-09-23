"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ClipboardCopy, Plus, Search, ShieldCheck, Trophy, UserRound, X } from "lucide-react";
import { eventUserSchema, roleDescriptions, type EventRole, type EventUser } from "@/lib/roles";
import { errorMessage, mutate } from "@/lib/client";
import { useDebounced, useResource } from "@/lib/hooks";
import { useApp } from "./app-provider";
import { Busy, EmptyState, ErrorState, LoadingCards, Modal, PageTitle } from "./ui";

type SponsorOption = { id: string; name: string };
type UserResponse = { rows: EventUser[]; hasMore: boolean; sponsors: SponsorOption[] };
export function AdminUsers() {
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  return <>
    <PageTitle eyebrow="YOU RUN THE EVENT" title="The right access for everyone." description="Admins run the event. Sponsors manage their pages. Members make connections." />
    <div className="role-overview">{(["admin", "sponsor", "member"] as EventRole[]).map((role) => {
      const Icon = role === "admin" ? ShieldCheck : role === "sponsor" ? Trophy : UserRound;
      return <article className={`role-overview-card overview-${role}`} key={role}><Icon size={25} /><span className={`role-chip role-${role}`}>{roleDescriptions[role].label}</span><p>{roleDescriptions[role].description}</p></article>;
    })}</div>
    <label className="search-field role-search"><Search size={19} /><input value={search} placeholder="Find a user by name or email" aria-label="Search event users" onChange={(e) => setSearch(e.target.value)} />{search && <button type="button" aria-label="Clear user search" onClick={() => setSearch("")}><X size={17} /></button>}</label>
    <UserRoster key={query} query={query} />
  </>;
}

function UserRoster({ query }: { query: string }) {
  const [offset, setOffset] = useState(0);
  const { data, error, loading, refresh } = useResource<UserResponse>(`/api/admin/users?${new URLSearchParams({ q: query, offset: String(offset) })}`);
  const [editing, setEditing] = useState<EventUser | null>(null);
  const [open, setOpen] = useState(false);
  const { notify, refreshMe } = useApp();
  return <>
    <div className="users-toolbar"><h2>Event users</h2><button className="button button-dark" type="button" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17} />Add user</button></div>
    {error && <ErrorState message={error} retry={() => void refresh()} />}
    {loading ? <LoadingCards /> : !data?.rows.length ? <EmptyState title="Bring your people in." action={<button className="button button-dark" type="button" onClick={() => { setEditing(null); setOpen(true); }}>Add an event user<ArrowRight size={17} /></button>}>Add a user here or import registrations from the Attendees section.</EmptyState> : <div className="users-list">
      {data.rows.map((user) => <article className="user-access-row" key={user.id}>
        <div className="user-access-identity"><strong>{user.registration_name}</strong><span>{user.registration_email}</span><small>{user.user_id ? "Account connected" : "Awaiting verified sign-in"}</small></div>
        <div className="user-access-permissions"><span className={`role-chip role-${user.role}`}>{roleDescriptions[user.role].label}</span><span className={`access-badge badge-${user.status}`}>{user.status}</span>{user.sponsor_ids.length > 0 && <p>{user.sponsor_ids.map((id) => data.sponsors.find((s) => s.id === id)?.name ?? "Assigned sponsor").join(", ")}</p>}</div>
        <button className="button button-outline button-small" type="button" onClick={() => { setEditing(user); setOpen(true); }} aria-label={`Edit access for ${user.registration_name}`}>Edit access</button>
      </article>)}
    </div>}
    {(offset > 0 || data?.hasMore) && <div className="pagination"><button type="button" className="button button-outline button-small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><span>Page {offset / 50 + 1}</span><button type="button" className="button button-outline button-small" disabled={!data?.hasMore} onClick={() => setOffset(offset + 50)}>Next</button></div>}
    <Modal open={open} onOpenChange={setOpen} title={editing ? "Edit user access" : "Add an event user"} description="Access belongs to this event. The user signs in and verifies the registration email you enter.">
      {open && <UserAccessForm key={editing?.id ?? "new"} existing={editing} sponsors={data?.sponsors ?? []} onSaved={async () => { setOpen(false); await refresh(); await refreshMe(); notify("User access saved."); }} />}
    </Modal>
  </>;
}

function UserAccessForm({ existing, sponsors, onSaved }: { existing: EventUser | null; sponsors: SponsorOption[]; onSaved: () => Promise<void> }) {
  const { guide, notify } = useApp();
  const [values, setValues] = useState({ id: existing?.id ?? null, expected_version: existing?.access_version ?? null,
    registration_name: existing?.registration_name ?? "", registration_email: existing?.registration_email ?? "",
    role: existing?.role ?? "member" as EventRole, status: existing?.status ?? "approved", directory_allowed: existing?.directory_allowed ?? true,
    sponsor_ids: existing?.sponsor_ids ?? [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const checked = eventUserSchema.parse(values);
      await mutate("/api/admin/users", "POST", checked); await onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="user-role-form">
    <div className="form-grid"><label className="form-field"><span>Name</span><input required maxLength={120} value={values.registration_name} onChange={(e) => setValues({ ...values, registration_name: e.target.value })} /></label><label className="form-field"><span>Registration email</span><input type="email" required readOnly={Boolean(existing?.user_id)} value={values.registration_email} maxLength={254} onChange={(e) => setValues({ ...values, registration_email: e.target.value })} /></label></div>
    {existing?.user_id && <p className="fine-print">This email is linked to a verified account.</p>}
    <label className="form-field"><span>Role</span><select aria-label="Role" aria-describedby="event-role-description" value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value as EventRole, sponsor_ids: e.target.value === "sponsor" ? values.sponsor_ids : [] })}><option value="admin">Admin — full event control</option><option value="sponsor">Sponsor — assigned sponsor pages</option><option value="member">Member — attendee app</option></select><small id="event-role-description">{roleDescriptions[values.role].description}</small></label>
    {values.role === "sponsor" && <fieldset className="sponsor-assignment-list"><legend>Pages this sponsor can edit</legend>{sponsors.length ? sponsors.map((sponsor) => <label key={sponsor.id}><input type="checkbox" checked={values.sponsor_ids.includes(sponsor.id)} onChange={(e) => setValues({ ...values, sponsor_ids: e.target.checked ? [...values.sponsor_ids, sponsor.id] : values.sponsor_ids.filter((id) => id !== sponsor.id) })} /><span>{sponsor.name}</span>{values.sponsor_ids.includes(sponsor.id) && <Check size={15} />}</label>) : <p>Create a sponsor page in Sponsors first, then assign it here.</p>}</fieldset>}
    <label className="form-field"><span>Access status</span><select value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as EventUser["status"] })}><option value="approved">Approved</option><option value="pending">Pending</option><option value="disabled">Disabled</option></select><small>Disabled users lose their event and editing privileges.</small></label>
    <label className="admin-checkbox"><input type="checkbox" checked={values.directory_allowed} onChange={(e) => setValues({ ...values, directory_allowed: e.target.checked })} /><span>Allow directory participation when this user opts in</span></label>
    <p className="fine-print">Adding a user prepares access. It does not send an email or publish their profile.</p>
    <button className="text-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/auth?mode=sign-up`); notify("Sign-up link copied."); } catch { notify("Copy the sign-up link from your browser instead.", true); } }}><ClipboardCopy size={15} />Copy sign-up link</button>
    {error && <ErrorState message={error} />}
    <div className="dialog-actions"><button type="submit" className="button button-red" disabled={busy || (values.role === "sponsor" && !values.sponsor_ids.length)}>{busy ? <Busy /> : guide.mode === "demo" ? "Preview permissions" : "Save user access"}</button></div>
  </form>;
}
