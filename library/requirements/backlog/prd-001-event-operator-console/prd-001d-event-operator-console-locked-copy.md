# PRD-001d: Copy and logo still locked in source

> **Status:** Deferred
> **Parent:** [prd-001-event-operator-console](./prd-001-event-operator-console-index.md)
> **Priority:** P2
> **Schema changes:** Additive
> **Do not start.** The Momentum Builder logo stays, and attendee-facing help copy stays as designed.

---

## Overview

Two attendee-facing pieces still require a commit and a Vercel deploy:

- The logo and brand mark: `data/event-brand.json` and `public/branding/momentum-builder-live-2026.png`, rendered from `src/components/ui.tsx`.
- Help topics for install, offline use, and privacy: `HelpScreen` in `src/components/more.tsx`. Support email and "where to find help" already come from `event_settings`.

Moving them into Admin is real product work. It is not required for speaker, time, or door corrections. Shipping it the week of the event risks the chrome every attendee sees.

---

## Goals

- An Admin can replace the logo with an uploaded public image and see it in the existing brand slot.
- An Admin can edit the help topic titles and bodies that are currently hardcoded, without editing install steps that are operating instructions for the phone.
- The attendee help page keeps its current section order and links.

## Non-Goals

- A CMS for every string in the app.
- Changing onboarding, offline shell (`public/sw.js`, `/offline.html`), or security headers.
- Letting a Sponsor edit the event logo or help page.

---

## User stories

- As the event Admin, I correct a help sentence after the event without asking for a deploy.
- As an attendee, the help page still tells me how to add the app to my home screen.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-4a | Given a new logo upload, when it is saved, then the brand slot uses that public HTTPS image and the previous image remains available until the new one is verified. |
| AC-4b | Given empty help overrides, when an attendee opens `/more/help`, then the current `HelpScreen` copy is what they see. |
| AC-4c | Given a help override, when it is published, then only that topic's title and body change. Install links and the support email line stay. |

---

## Implementation notes

- Prefer nullable override columns or one `event_content` row over replacing `HelpScreen` with a freeform HTML field. Render text, not HTML, so a paste cannot inject markup.
- Logo upload reuses `kind=asset` and the same decode-and-re-encode path as sponsor logos.
- Fallback to the files in `data/event-brand.json` and the current JSX when the database value is null. That fallback is what keeps a bad save from blanking the live brand.

---

## Open questions

- [ ] Freeze the official Momentum Builder logo through 2026-10-08?
