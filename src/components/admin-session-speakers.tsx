"use client";

import Link from "next/link";
import { useState } from "react";

interface SpeakerChoice { id: string; label: string; published?: boolean }

/** Selection is draft form state until the session and links commit together. */
export function AdminSessionSpeakers({ choices, selected, ready, onChange }: {
  choices: SpeakerChoice[];
  selected: string[];
  ready: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = choices.filter((speaker) => speaker.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const unavailable = selected.filter((id) => !choices.some((speaker) => speaker.id === id));
  return <fieldset className="session-speaker-picker" disabled={!ready}>
    <legend>Speakers for this session</legend>
    <p className="fine-print">Select every speaker taking part. Draft speakers stay hidden from attendees until published. Changes save with the session.</p>
    {!ready ? <p role="status">Speaker choices are not available yet. Save stays unavailable until they load.</p> : <>
      <label className="form-field"><span>Find a speaker</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search speaker names" /></label>
      <div className="session-speaker-choices">
        {visible.map((speaker) => <label className="admin-checkbox" key={speaker.id}>
          <input type="checkbox" checked={selected.includes(speaker.id)} disabled={selected.length >= 100 && !selected.includes(speaker.id)} onChange={(event) => onChange(event.target.checked ? [...selected, speaker.id] : selected.filter((id) => id !== speaker.id))} />
          <span>{speaker.label}{speaker.published === false && <small> · Draft</small>}</span>
        </label>)}
        {!visible.length && <p>{choices.length ? "No speakers match your search." : <>No speakers yet. <Link href="/admin/speakers">Add a speaker</Link>, then return to this session.</>}</p>}
        {unavailable.map((id) => <label className="admin-checkbox" key={id}><input type="checkbox" checked onChange={() => onChange(selected.filter((selectedId) => selectedId !== id))} /><span>Unavailable speaker — uncheck to remove</span></label>)}
      </div>
      <div className="session-speaker-summary"><span role="status">{selected.length} selected</span>{selected.length > 0 && <button type="button" className="text-button" onClick={() => onChange([])}>Clear selection</button>}</div>
    </>}
  </fieldset>;
}
