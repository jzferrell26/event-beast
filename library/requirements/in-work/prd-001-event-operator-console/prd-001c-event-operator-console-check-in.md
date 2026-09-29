# PRD-001c: Door check-in

> **Status:** Deferred
> **Parent:** [prd-001-event-operator-console](./prd-001-event-operator-console-index.md)
> **Priority:** P2
> **Schema changes:** Additive (`event_checkins`)

Decision on 2026-09-29: welcome and venue text already cover check-in. Do not build this for the live event.

---

## Overview

Nothing in the app records that a person walked in. "Check-in" today is copy on the sample welcome desk (`venue_locations`) plus the digital arrival flow: `/join`, verify email, claim an approved registration. Staff who need to fix access already use `/admin/attendees` and `/admin/users`.

This sub-feature adds a door list for the assigned Admin. She searches the roster and marks arrived. Arrival is private to Admins. The attendee guide does not show it.

Build this only after the open question on the parent PRD confirms a door list is what this event needs. If the need is only the welcome-desk sentence, edit Venue and stop.

---

## Goals

- Search approved registrations by name or email from `/admin/check-in`.
- Mark arrived, clear a mistaken arrival, and add a short staff note.
- Show counts for the Admin: expected, arrived, not yet arrived.
- Keep emails and phone numbers off any attendee-facing response. Admins already may see registration emails in the roster. The door list may show them to Admins only.

## Non-Goals

- QR codes, badges, wristbands, or a public "I'm here" button.
- Walk-up registration. Someone not on the roster is added through the existing attendee import or `/admin/attendees`, then checked in.
- Changing `attendees.status`. Arrived is not the same as approved. Disabling a registration remains the Users and Attendees screens.
- Broadcasting arrivals to sponsors, the directory, or announcements.
- Offline door mode. The console already requires a connection. A paper backup is a human process, not this PRD.

---

## User stories

- As the door Admin, I find a guest by last name and mark her arrived in one tap.
- As the door Admin, I undo a mark when I tapped the wrong row.
- As an attendee, People and Inbox never show whether I have arrived.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-3a | Given an approved attendee and no check-in row, when an Admin marks arrived, then one `event_checkins` row exists with `status = arrived`, `arrived_at` set, and `recorded_by` set to the acting admin. |
| AC-3b | Given that row, when she clears it, then status returns to `expected` and `arrived_at` is null. The row is kept. |
| AC-3c | Given a pending or disabled registration, when she tries to mark arrived, then the API rejects the write. |
| AC-3d | Given a Member or Sponsor session, when they call `GET` or `PATCH /api/admin/check-in`, then the server denies the request. |
| AC-3e | Given any arrival state, when an attendee loads `/api/guide`, `/people`, or `/inbox`, then the response contains no check-in field. |
| AC-3f | Given two rapid marks on the same attendee, when both complete, then one row remains and the later write wins without a duplicate. |

---

## Data model

New table `public.event_checkins`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, `gen_random_uuid()` |
| `event_id` | `uuid` | References `events`, not null |
| `attendee_id` | `uuid` | References `attendees`, not null |
| `status` | `text` | `expected` or `arrived` |
| `arrived_at` | `timestamptz` | Null unless arrived |
| `note` | `text` | Staff note, max 500, default empty |
| `recorded_by` | `uuid` | Acting attendee id, nullable |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Maintained on write |

Unique `(event_id, attendee_id)`. Index `(event_id, status)`.

RLS: no `guide_read` policy. Select, insert, and update only through `is_event_admin` for the row's event. No delete policy in v1; clear arrival by updating status. Enable RLS before grants. Do not add this table to the public guide query in `src/lib/server/guide.ts`.

---

## API

`/api/admin/check-in`

- `GET ?q=` returns matching roster rows for this event plus check-in status. Admin only. Paginate the same way `/api/admin/attendees` does.
- `PATCH { attendee_id, status, note }` upserts the unique pair. Validate status enum and note length with zod. Reject unless the attendee is `approved` and belongs to this event.

Writes go in `audit_log` with the acting admin, attendee id, and new status. Do not log the note if it could contain a phone number copied from a conversation. The note field itself is enough for staff.

---

## Implementation notes

- New route `src/app/admin/check-in/page.tsx` and a focused screen, not another generic `adminResources` entry. The generic editor has no search-and-toggle pattern.
- Add the sidebar item in `adminNav` only when this page exists.
- Venue welcome-desk copy stays in `/admin/venue_locations`. Do not overload that description with attendance.

---

## Open questions

- [ ] Confirm this week needs a door list rather than a venue-text edit.
- [ ] One list for all three days, or a day filter? Default proposal: one list for the event, no day column, until someone asks to split days.
