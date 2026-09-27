"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CheckCircle2, Circle, ClipboardCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useResource } from "@/lib/hooks";
import { errorMessage, mutate } from "@/lib/client";
import { launchCheckDefinitions, type LaunchCheck, type LaunchCheckKey, type LaunchReadiness } from "@/lib/launch-readiness";
import { useApp } from "./app-provider";
import { Busy, ErrorState, LoadingCards, Modal, PageTitle } from "./ui";

export function LaunchCenter() {
  const { data, error, loading, refresh } = useResource<LaunchReadiness>("/api/admin/launch");
  const { notify } = useApp();
  const [editing, setEditing] = useState<LaunchCheckKey | null>(null);
  const definition = launchCheckDefinitions.find((c) => c.key === editing);
  return <>
    <PageTitle eyebrow="BEFORE THE FIRST ATTENDEE ARRIVES" title="Ready for the room." description="See what is filled in, what still needs attention, and which live checks your team has recorded."
      action={<button className="button button-outline" type="button" onClick={() => void refresh()}><RefreshCw size={16} />Refresh review</button>} />
    {error && <ErrorState message={error} retry={() => void refresh()} />}
    {loading ? <LoadingCards count={3} /> : data && <>
      <section className="launch-summary" aria-label="Launch readiness summary">
        <div className="launch-summary-icon"><ClipboardCheck size={30} /></div>
        <div><span className="eyebrow">{data.mode === "demo" ? "SAMPLE EVENT REVIEW" : "CURRENT EVENT REVIEW"}</span>
          <h2>{data.contentReady && data.organizerChecksRecorded ? "Your recorded checks are complete." : "Make the final details count."}</h2>
          <p>{data.content.filter((item) => item.status === "ready").length} of {data.content.length} content checks ready · {data.checks.filter((check) => check.verified).length} of {launchCheckDefinitions.length} live checks recorded.</p>
          <small>Content checks inspect saved records. Live checks below are recorded by an organizer; this page does not run them automatically.</small>
        </div>
      </section>
      <section className="launch-section"><div className="launch-section-heading"><h2>The details attendees will see.</h2><p>Review every item against the confirmed event program.</p></div>
        <div className="launch-content-list">{data.content.map((item) => <Link href={item.href} className="launch-content-item" key={item.key}>
          {item.status === "ready" ? <CheckCircle2 className="launch-ready" size={23} /> : <TriangleAlert className="launch-attention" size={23} />}
          <div><span className={`launch-state ${item.status}`}>{item.status === "ready" ? "Content present" : "Needs attention"}</span><h3>{item.title}</h3><p>{item.detail}</p></div><ArrowUpRight size={17} />
        </Link>)}</div>
      </section>
      <section className="launch-section"><div className="launch-section-heading"><h2>The checks that need real use.</h2><p>Record the environment, devices or accounts used and what happened. No attendee passwords or private message contents belong in these notes.</p></div>
        <div className="launch-manual-grid">{launchCheckDefinitions.map((item) => {
          const check = data.checks.find((c) => c.check_key === item.key);
          return <article className="launch-manual-card" key={item.key}>
            <div className="launch-manual-state">{check?.verified ? <CheckCircle2 size={22} className="launch-ready" /> : <Circle size={22} />}<span>{check?.verified ? "Recorded as checked" : "Awaiting verification"}</span></div>
            <h3>{item.title}</h3><p>{item.detail}</p>{check?.notes && <blockquote>{check.notes}</blockquote>}
            {check?.verified_at && <small>Recorded by an organizer · {new Date(check.verified_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small>}
            <button className="button button-outline" type="button" onClick={() => setEditing(item.key)}>{check ? "Review recorded check" : "Record verification"}<ArrowUpRight size={16} /></button>
          </article>;
        })}</div>
      </section>
      <p className="launch-review-time">Review generated {new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Refresh after content changes and repeat any affected live checks.</p>
    </>}
    <Modal open={Boolean(definition)} onOpenChange={(open) => { if (!open) setEditing(null); }} title={definition?.title ?? "Record verification"} description={definition?.detail}>
      {definition && <VerificationForm key={`${definition.key}:${data?.checks.find((check) => check.check_key === definition.key)?.version ?? 0}`} checkKey={definition.key} existing={data?.checks.find((check) => check.check_key === definition.key)} onSaved={() => { setEditing(null); void refresh(); notify("Organizer verification recorded."); }} />}
    </Modal>
  </>;
}

function VerificationForm({ checkKey, existing, onSaved }: { checkKey: LaunchCheckKey; existing?: LaunchCheck; onSaved: () => void }) {
  const { guide } = useApp();
  const [verified, setVerified] = useState(existing?.verified ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await mutate("/api/admin/launch", "PATCH", { check_key: checkKey, verified, notes, expected_version: existing?.version ?? 0 }); onSaved(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    {guide.mode === "demo" && <p className="demo-notice">Preview only. Live verification cannot be recorded for this sample event.</p>}
    <label className="admin-checkbox"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /><span>I completed this check in the environment described below</span></label>
    <label className="form-field"><span>Verification notes{verified ? " *" : ""}</span><textarea rows={5} maxLength={2000} required={verified} minLength={verified ? 3 : undefined} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Environment, devices or test accounts, date, and result. Keep credentials and private content out of these notes." /><small>{notes.length}/2,000 characters</small></label>
    {error && <ErrorState message={error} />}
    <div className="dialog-actions"><button type="submit" className="button button-dark" disabled={busy || guide.mode === "demo" || (verified && notes.trim().length < 3)}>{busy ? <Busy /> : <><Check size={17} />{guide.mode === "demo" ? "Preview only" : "Save verification"}</>}</button></div>
  </form>;
}
