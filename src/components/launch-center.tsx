"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CheckCircle2, Circle, ClipboardCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useResource } from "@/lib/hooks";
import { errorMessage, mutate } from "@/lib/client";
import { launchDefinitionsFor, type LaunchCheck, type LaunchCheckKey, type LaunchReadiness, type ProgramReview } from "@/lib/launch-readiness";
import { useApp } from "./app-provider";
import { Busy, ErrorState, LoadingCards, Modal, PageTitle } from "./ui";

export function LaunchCenter() {
  const { data, error, loading, refresh } = useResource<LaunchReadiness>("/api/admin/launch");
  const { notify } = useApp();
  const [editing, setEditing] = useState<LaunchCheckKey | null>(null);
  const [reviewing, setReviewing] = useState<ProgramReview | null>(null);
  const launchCheckDefinitions = launchDefinitionsFor(data?.publicSite, data?.communityEnabled);
  const definition = launchCheckDefinitions.find((c) => c.key === editing);
  return <>
    <PageTitle eyebrow="BEFORE THE FIRST ATTENDEE ARRIVES" title="Ready for the room." description="See what is filled in, what still needs attention, and which live checks your team has recorded."
      action={<button className="button button-outline" type="button" onClick={() => void refresh()}><RefreshCw size={16} />Refresh review</button>} />
    {error && <ErrorState message={error} retry={() => void refresh()} />}
    {loading ? <LoadingCards count={3} /> : data && <>
      <section className="launch-summary" aria-label="Launch readiness summary">
        <div className="launch-summary-icon"><ClipboardCheck size={30} /></div>
        <div><span className="eyebrow">{data.mode === "demo" ? "SAMPLE EVENT REVIEW" : "CURRENT EVENT REVIEW"}</span>
          <h2>{data.eventReady ? "Your recorded checks are complete." : "Make the final details count."}</h2>
          <p>{data.content.filter((item) => item.status === "ready").length} of {data.content.length} content checks ready · {data.checks.filter((check) => check.verified).length} of {launchCheckDefinitions.length} live checks recorded.</p>
          <p>{data.runtime.filter((item) => item.status === "ready").length} of {data.runtime.length} deployment checks ready.</p>
          <small>Content checks inspect saved records. Live checks below are recorded by an organizer; this page does not run them automatically.</small>
        </div>
      </section>
      {(!data.publicSite || data.communityEnabled) && <><section className="launch-roster" aria-label="Registration readiness">
        <Link href="/admin/attendees"><strong>{data.approvedMembers}</strong><span>Approved members & sponsors</span></Link>
        <Link href="/admin/users"><strong>{data.approvedAttendees}</strong><span>Total approved, including Admins</span></Link>
        <Link href="/admin/attendees"><strong>{data.claimedAttendees}</strong><span>Approved accounts connected</span></Link>
        <Link href="/admin/attendees"><strong>{data.pendingRequests}</strong><span>Awaiting access approval</span></Link>
      </section>
      <p className="launch-roster-note">Compare these counts with the organizer’s final registration list. A bootstrap Admin is not an attendee roster; importing registrations does not send invitations or create accounts.</p></>}
      {data.publicSite && !data.communityEnabled && <p className="public-guide-note">Public information site: attendees do not need accounts. Email checks apply to organizer access and recovery, not attendee registration. Community messaging and roster imports are not release gates for this site.</p>}
      <section className="launch-section"><div className="launch-section-heading"><h2>The deployment attendees will use.</h2><p>These checks read this deployment’s configuration. A checked box below cannot override a closed email gate.</p></div>
        <div className="launch-content-list">{data.runtime.map((item) => <Link href={item.href} className="launch-runtime-item" key={item.key}>
          {item.status === "ready" ? <CheckCircle2 className="launch-ready" size={23} /> : <TriangleAlert className="launch-attention" size={23} />}
          <div><span className={`launch-state ${item.status}`}>{item.status === "ready" ? "Configured" : "Needs attention"}</span><h3>{item.title}</h3><p>{item.detail}</p></div><ArrowUpRight size={17} />
        </Link>)}</div>
      </section>
      <section className="launch-section"><div className="launch-section-heading"><h2>The details attendees will see.</h2><p>Review every item against the confirmed event program.</p></div>
        <div className="launch-content-list">{data.content.map((item) => <Link href={item.href} className="launch-content-item" key={item.key}>
          {item.status === "ready" ? <CheckCircle2 className="launch-ready" size={23} /> : <TriangleAlert className="launch-attention" size={23} />}
          <div><span className={`launch-state ${item.status}`}>{item.status === "ready" ? "Content present" : "Needs attention"}</span><h3>{item.title}</h3><p>{item.detail}</p></div><ArrowUpRight size={17} />
        </Link>)}</div>
      </section>
      <section className="launch-section" id="program-review"><div className="launch-section-heading"><h2>Resolve the working program.</h2><p>Keep the original source question, record the organizer’s decision, and leave unconfirmed sessions unpublished. Later session edits reopen the decision for review.</p></div>
        {!data.programReview.length ? <p className="launch-review-empty">No imported source questions are recorded for this event.</p> : <div className="launch-manual-grid">{data.programReview.map((review) => <article className="launch-manual-card launch-program-card" key={review.session_id}>
          <div className="launch-manual-state">{review.review_status === "pending" ? <TriangleAlert className="launch-attention" size={22} /> : <CheckCircle2 className="launch-ready" size={22} />}<span>{review.review_status === "pending" ? "Awaiting decision" : review.review_status === "confirmed" ? "Confirmed for attendees" : "Excluded from the program"}</span></div>
          <h3>{review.title}</h3><p>{review.issue}</p><small>{review.source_sheet}, row {review.source_row} · {review.published ? "Currently published" : "Currently unpublished"}</small>
          {review.resolution_notes && <blockquote>{review.resolution_notes}</blockquote>}
          <div className="launch-review-actions"><Link href="/admin/agenda_sessions" className="text-button">Open agenda editor<ArrowUpRight size={15} /></Link><button className="button button-outline" type="button" onClick={() => setReviewing(review)}>Review decision<ArrowUpRight size={16} /></button></div>
        </article>)}</div>}
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
    <Modal open={Boolean(reviewing)} onOpenChange={(open) => { if (!open) setReviewing(null); }} title={reviewing?.title ?? "Program review"} description={reviewing?.issue}>
      {reviewing && <ProgramReviewForm key={`${reviewing.session_id}:${reviewing.review_version}`} review={reviewing} onSaved={() => { setReviewing(null); void refresh(); notify("Organizer decision recorded."); }} />}
    </Modal>
  </>;
}

function ProgramReviewForm({ review, onSaved }: { review: ProgramReview; onSaved: () => void }) {
  const { guide } = useApp();
  const [status, setStatus] = useState<ProgramReview["review_status"]>(review.review_status);
  const [notes, setNotes] = useState(review.resolution_notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await mutate("/api/admin/program-review", "PATCH", { session_id: review.session_id, status, notes, expected_version: review.review_version });
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    <p className="fine-print">{review.source_sheet}, row {review.source_row}. This decision does not change the agenda itself. Correct the session in the agenda editor first.</p>
    <label className="form-field"><span>Organizer decision</span><select value={status} onChange={(event) => setStatus(event.target.value as ProgramReview["review_status"])}>
      <option value="pending">Still awaiting confirmation</option>
      <option value="confirmed" disabled={!review.published}>Confirmed — corrected session is published</option>
      <option value="excluded" disabled={review.published}>Excluded — session remains unpublished</option>
    </select></label>
    <label className="form-field"><span>Decision notes{status !== "pending" ? " *" : ""}</span><textarea rows={5} required={status !== "pending"} minLength={status !== "pending" ? 3 : undefined} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Who confirmed the decision, when, and what attendees should see. Do not include private contact information." /></label>
    {error && <ErrorState message={error} />}
    <div className="dialog-actions"><button className="button button-dark" type="submit" disabled={busy || guide.mode === "demo" || (status !== "pending" && notes.trim().length < 3)}>{busy ? <Busy /> : guide.mode === "demo" ? "Preview only" : "Save decision"}</button></div>
  </form>;
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
