# PRD-001b: Speakers and session times

> **Status:** Implemented and locally qualified; production release checks pending
> **Parent:** [prd-001-event-operator-console](./prd-001-event-operator-console-index.md)
> **Priority:** P0
> **Schema changes:** Additive transactional session-save RPC; no new tables or columns

---

## Overview

Speaker text and session clock times are already database fields with Admin forms. This sub-feature makes those forms finishable by the event lead: upload a portrait, attach speakers on the session itself, and save a time in the event timezone. Unpublished edits stay off `/agenda` and `/more/speakers`.

---

## Goals

- Edit a speaker's name, role, biography, source link, and published flag without a deploy.
- Upload a JPG, PNG, or WebP from the speaker list and from the sponsor list, and store the public URL on `headshot_url` or `logo_url`.
- The same upload remains available inside the edit form.
- Leave the attendee agenda, speaker pages, and sponsor pages visually as they are. Only the saved image URL changes.
- Edit a session's title, description, room, type, start, and end in the event timezone (`wallToInstant` already rejects ambiguous DST times).
- Add or remove that session's speakers from the session form.
- Leave the attendee agenda and speaker pages visually as they are. Only the saved published fields change.

## Non-Goals

- Re-importing `data/momentum-builder-working-schedule.json` or `data/official-speakers.json` from the Admin UI. Those scripts stay an operator tool. `scripts/sync-official-speakers.mjs` must keep refusing to overwrite a biography an organizer already edited.
- A drag-and-drop schedule builder.
- Changing session types beyond the current set: Keynote, Workshop, Panel, Networking, Break, Session.
- Putting speaker photos in `event-headshots`. That bucket is for private attendee portraits and returns signed URLs. Speaker portraits belong in public `event-assets`.

---

## User stories

- As the event Admin, I fix a speaker biography and photo on my phone between sessions, then publish it.
- As the event Admin, I move a workshop 15 minutes later and the agenda shows the new time after refresh.
- As an attendee offline on the service worker cache, I may see the previous time until I refresh. That is expected.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-2a | Given an Admin and a speaker row, when she saves a new biography, then `speakers.bio` updates, `invalidatePublicGuide()` runs, and a published speaker shows the new bio on `/more/speakers/[id]`. |
| AC-2b | Given a JPG, PNG, or WebP at or under 3 MB, when she uploads it on the speaker form, then the file is re-encoded to WebP under `event-assets/<event-id>/organizer/` and `headshot_url` is that public HTTPS URL. |
| AC-2c | Given a non-image or a file over 3 MB, when she uploads it, then the API returns the existing upload error and `headshot_url` is unchanged. |
| AC-2d | Given a session, when she sets an end time at or before the start, then the save is rejected with the current validation message. |
| AC-2e | Given a session form, when she adds a speaker, then one `session_speakers` row exists for that pair and the public session lists that speaker after publish. |
| AC-2f | Given `published = false`, when an attendee loads `/api/guide`, then the speaker or session is omitted. |
| AC-2g | Given the current attendee components, when a published time or bio changes, then `/agenda` and `/more/speakers` render the new values with no new navigation item. |

---

## Implementation notes

- Speaker fields today: `full_name`, `title`, `bio`, `headshot_url`, `source_url`, `published`, `is_demo` in `src/lib/admin-resources.ts`.
- Upload path to reuse: `POST /api/uploads` with `kind=asset`, which already requires an Admin and returns a public URL (`src/app/api/uploads/route.ts`). The speaker form should call it and write `headshot_url`. Keep the URL field for an already-hosted portrait.
- `sort_order` is optional. Default `100`. Public order stays the current database order unless a later client change sorts by `sort_order` then `full_name`. Do not change `src/components/speakers.tsx` layout in this sub-feature. If the client does not read `sort_order` yet, shipping the column alone must not reorder anyone.
- Session speaker linking stays the existing table. The session form may load and save those rows. Do not invent a speaker-id array column on `agenda_sessions`.
- The form loads admin-only `speaker_ids` alongside session rows and sends them with session fields. `admin_save_agenda_session` commits the session and join-table delta atomically, preserves existing link identities, rejects foreign-event speakers, and keeps audit/RLS triggers active. This is an RPC argument and admin response field, not a stored array or public guide addition.
- Immediate list uploads use an image-only PATCH. Do not resend the list's older biography, publication, tier, or booth values when saving an image. Form uploads remain draft form state until Save changes.
- Editing a reviewed session already reopens `agenda_import_notes` through `reopen_agenda_review`. Keep that. Tell the Admin in the form when a save sends the session back to Launch Center review.
- Time inputs already convert wall time with `instantToWall` / `wallToInstant` in `src/lib/admin-resources.ts`. Keep the event timezone from `events.timezone`.

---

## Open questions

- [x] Parent decision confirmed upload buttons on both the speaker and sponsor/vendor lists. Existing synced images remain until the organizer replaces them.
