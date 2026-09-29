# PRD-001a: Assign the event Admin

> **Status:** Identity decided; existing access workflow retained; production assignment pending
> **Parent:** [prd-001-event-operator-console](./prd-001-event-operator-console-index.md)
> **Priority:** P0
> **Schema changes:** None

---

## Overview

The role model already grants an Admin full event-management rights. This sub-feature is the handoff: the approved `team@momentumbuilder.com` account can sign in, land in the organizer console, and find speakers, sessions, and attendees without hunting UUIDs. It does not create a second permission system. Per the parent's September 29 decision, assigning production access is a separate operator step; this source change does not grant it.

---

## Goals

- A current Admin can set one roster email to Admin and approved from `/admin/users`.
- That person verifies the same email, opens `/admin`, and sees this event's name in the sidebar.
- The console home links to program and people. There is no door check-in feature in this release.
- A non-admin cannot open the console or call its APIs.

## Non-Goals

- Invitation email. `docs/ROLES.md` already says adding a user does not send mail. Share the existing sign-up link through the approved channel.
- Multi-event switching. The app is one event, selected by `EVENT_BEAST_EVENT_SLUG` (default `momentum-builder-live-2026`).
- Demoting the last verified active Admin. The current last-admin protection stays.

---

## User stories

- As the owner, I assign our event lead as Admin so she can correct the program the morning of the event.
- As that Admin, I open one home screen and see where speakers, times, and attendee access live.
- As an attendee, my home, agenda, and inbox look the same after her account is created.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1a | Given an approved registration, when an Admin sets `access_role` to `admin` on `/admin/users`, then the audit log records the change and the attendee guide payload is unchanged. |
| AC-1b | Given that registration's email is verified, when she opens `/admin`, then the shell shows the live event name and the demo banner is absent. |
| AC-1c | Given a Member session, when she requests `/admin` or `POST /api/admin/content/speakers`, then access is denied. |
| AC-1d | Given demo mode, when role assignment is attempted, then the write is refused. |

---

## Implementation notes

- Use `admin_save_event_user`. Do not write `access_role` with the publishable client outside that RPC.
- Home cards live in `AdminOverview` in `src/components/admin.tsx`. Add a check-in card only after 001c has a route. Until then, point "Program" at `/admin/agenda_sessions` and "People" at `/admin/attendees`.
- Sidebar already groups agenda days, sessions, speakers, and session speakers under Agenda (`adminNav` in the same file). Keep that grouping.
- Do not change `(event)` layouts or `pageAccess` for members.

---

## Open questions

- [x] Admin email confirmed in the parent decision: `team@momentumbuilder.com`.
- [ ] Separate operator handoff: assign approved Admin access through `/admin/users`, verify the email/account, and confirm `/admin` access on the released build. Do not bypass the role RPC or mark this complete based on synthetic tests.
