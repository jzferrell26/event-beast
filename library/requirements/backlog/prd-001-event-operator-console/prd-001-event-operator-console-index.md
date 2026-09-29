# PRD-001: Event operator console

> **Status:** Backlog
> **Priority:** P0
> **Effort:** XL (> 3d)
> **Schema changes:** Additive
> **Event:** Momentum Builder Live, working program 2026-10-06 through 2026-10-08

---

## Overview

Momentum Builder Live is already a Next.js app on Vercel with content in Supabase. An organizer console exists at `/admin`. An assigned Admin can already change the event name, welcome copy, announcements, agenda days, session times, speaker name/title/bio, sponsor pages, lunch, venue, and the registration roster. Those writes stay inside the event, pass through existing row-level security, and refresh the public guide within about 15 seconds.

The gap is not "there is no backend." The gap is that a non-developer assigned for this event still cannot run the day from that console. Speaker photos are a pasted HTTPS URL. Speakers attach to sessions on a separate screen. There is no door check-in. Help-page instructions and the logo still live in source files. This plan closes those operator gaps without changing the attendee app's routes, layout, or public guide contract.

Inspection date: 2026-09-29, branch `main` at the time of writing.

---

## Goals

- An event Admin, assigned from `/admin/users`, can update speaker details, session times, and the rest of the published program without a code deploy.
- Speaker photos and sponsor logos can be uploaded from the admin list. The attendee pages keep their current layout and only swap the image URL.
- Welcome, venue, and support text stay on the existing admin forms. No door check-in list.
- The Momentum Builder logo and help page stay in source. They are not part of this admin work.

## Non-Goals

- Rebuilding the attendee app, the sponsor workspace, messaging, or launch-readiness checks.
- Replacing Supabase Auth, the three-role model in `docs/ROLES.md`, or row-level security with a service-role admin API.
- Ticket sales, payments, badge printing, QR credentials, or a HighLevel sync.
- Editing production event rows as part of writing this plan.
- A visual redesign of `/`, `/agenda`, or `/more/*`.

---

## What already works

Keep these. Do not replace them with a second content store.

| Operator job | Where it lives today | Attendee effect |
|---|---|---|
| Assign Admin, Sponsor, or Member | `/admin/users`, `attendees.access_role` | None until that person signs in |
| Event name, dates, publish switch | Overview "Event details" modal, `events` | Name and dates appear after save; publish exposes the guide |
| Welcome, support email, agenda notice | `/admin/event_settings` | Home and help support lines |
| Session title, room, start, end | `/admin/agenda_sessions` | `/agenda` after publish |
| Speaker name, title, bio, headshot URL | `/admin/speakers` | `/more/speakers` after publish |
| Link a speaker to a session | `/admin/session_speakers` | Session detail |
| Announcements, lunch, venue, sponsors | Matching `/admin/*` resources | Matching `/more/*` pages |
| Roster name, email, approved/disabled | `/admin/attendees` | Who can claim access at `/join` |

Public pages are `force-dynamic`. The guide cache is `unstable_cache` with `revalidate: 15` in `src/lib/server/guide.ts`, and admin writes call `invalidatePublicGuide()`. Offline phones can keep a stale guide in `public/sw.js` until they refresh. That delay is accepted. It is not a reason to bypass the cache.

---

## Sub-features

| Sub-PRD | Scope | Status |
|---|---|---|
| [`prd-001a-event-operator-console-assignment`](./prd-001a-event-operator-console-assignment.md) | Grant `team@momentumbuilder.com` as event Admin | Decided, not yet applied in production |
| [`prd-001b-event-operator-console-program`](./prd-001b-event-operator-console-program.md) | Upload buttons on the speaker list and the sponsor (vendor) list | In progress |
| [`prd-001c-event-operator-console-check-in`](./prd-001c-event-operator-console-check-in.md) | Door list | Deferred. Welcome and venue text already cover this |
| [`prd-001d-event-operator-console-locked-copy`](./prd-001d-event-operator-console-locked-copy.md) | Help copy and logo | Deferred. Logo stays the Momentum Builder mark. No live-facing edits |

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a verified registration with `access_role = admin` and status `approved`, when that person opens `/admin`, then she can edit speakers and sessions for this event only. |
| AC-2 | Given a Member or Sponsor session, when they request any `/api/admin/*` route, then the server denies the request and the attendee guide is unchanged. |
| AC-3 | Given an unpublished speaker or session, when an attendee loads `/api/guide`, then that record is absent. |
| AC-4 | Given a published session time change, when an attendee reloads `/agenda` after the guide invalidation, then the new start and end appear, and no other route's layout changes. |
| AC-5 | Given a speaker or sponsor row in `/admin`, when an Admin uses Upload photo or Upload logo, then the new HTTPS URL is saved on that row and the attendee page layout is unchanged. |
| AC-6 | Given demo mode, when any operator save is attempted, then the write is refused and the sample guide is unchanged. |

---

## Data model changes

Additive only. No renames, no drops, no change to the public guide's required fields.

| Change | Why | Public guide |
|---|---|---|
| `speakers.sort_order integer not null default 100` | Optional display order. Alphabetical name remains the fallback | Client may sort by it later. Until 001b ships, omit it from any required field |
| `event_checkins` | Door attendance, admin-only | Not selected by `guide.ts` |

Check-in columns are specified in 001c. Existing tables `events`, `event_settings`, `speakers`, `agenda_days`, `agenda_sessions`, `session_speakers`, `attendees`, and `venue_locations` stay the source of truth.

---

## API changes

| Surface | Change |
|---|---|
| `/api/admin/content/[resource]` | Keep the current resource allowlist in `src/lib/admin-resources.ts`. Extend speaker fields only as 001b specifies |
| `/api/admin/check-in` | New. Admin-only. Specified in 001c |
| `/api/guide` | No required-field changes. Do not add check-in counts or arrival status |
| `/api/uploads` | Reuse `kind=asset` for speaker photos. Do not store speaker portraits in the private `event-headshots` bucket |

---

## Public contract

The attendee app keeps these routes and their current jobs: `/`, `/agenda`, `/agenda/[id]`, `/people`, `/inbox`, `/more`, `/more/speakers`, `/more/sponsors`, `/more/lunch`, `/more/venue`, `/more/notifications`, `/more/help`, `/join`, `/auth`.

Operator work is confined to `/admin` and `/api/admin/*`. A save that is not published must not change what an attendee sees. A published save may change the text, time, or image the existing components already render. It must not add navigation, change copy tone on untouched screens, or alter sponsor, directory, or messaging behavior.

---

## Decisions (2026-09-29)

- Admin identity: `team@momentumbuilder.com`. This matches the support address already imported for the event. Production role assignment is a separate operator step in `/admin/users`. This change does not grant the role.
- Check-in text already works. Do not build a door list.
- Speaker list and vendor list need upload buttons. Vendors are the Sponsors admin resource.
- Keep the Momentum Builder logo. Do not edit attendee-facing design, help copy, or brand files.

## Open questions

- [x] What email should receive the Admin role? `team@momentumbuilder.com`
- [x] Check-in: existing welcome and venue text is enough
- [x] Speaker and vendor images: upload buttons on the admin lists
- [x] Logo stays frozen through the event

---

## Related

- `docs/ROLES.md`: Admin, Sponsor, and Member capabilities already enforced
- `docs/EVENT-DAY-HANDOFF.md`: attendee arrival is email claim, not a door scan
- `src/lib/admin-resources.ts`: fields the console can save today
- `src/lib/server/guide.ts`: public read model and 15-second cache
- `src/app/admin/[resource]/page.tsx`: generic resource editor
