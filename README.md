# Event Beast — Momentum Builder LIVE 2026

An event companion built with Next.js, TypeScript and Supabase. The mobile experience includes an event dashboard, structured agenda, opt-in attendee directory, durable private conversations, sponsors, lunch and venue information, profile privacy controls, saved sessions and a dismissible walkthrough. The organizer console manages event content, registrations, CSV imports, sponsor placements and reports.

## Run the sample application

```sh
npm ci
```

Copy `.env.example` to `.env.local`, set `EVENT_BEAST_DEMO_MODE=true`, then run:

```sh
npm run icons
npm run dev
```

Open `http://localhost:3100`. The sample program, dates, venues and people are clearly labeled. Demo pages do not send messages or publish profile/admin edits. Saved sample session IDs and walkthrough progress can be kept on the device. Cuantico’s Platinum sponsorship is the only confirmed sponsor fact included; the other sponsor examples do not imply real agreements.

## Architecture and privacy

The repository is the source of truth. Event Beast requires its own Supabase project and Vercel project under Cuantico AI. It must never share the Listing Studio or Cuantico SMS database. SMS is handled separately in HighLevel.

Authentication, event registration eligibility and directory visibility are separate. Imports contain private registration records. A verified account must match an approved registration to access private attendee features. Directory visibility and messaging consent start off. Attendee email, phone and personal contact details are visible only to Admins; members and sponsors connect through private chat.

Postgres owns conversations, messages, read state and idempotency. Private Realtime broadcasts signal clients to re-read authorized durable data. Blocking, disabled access and consent are enforced in database RPCs and RLS. Organizer moderation is limited to reported messages; organizers do not receive blanket access to private inboxes.

Event Beast launches as a website: no App Store review or download is needed. Home-screen installation is optional. A separate offline reader preserves previously loaded public essentials; it never caches private messages, profiles, auth responses or organizer data. Sessions persist on the attendee's browser, with revocation still enforced by the backend.

## Checks and deployment

The Admin / Sponsor / Member permission model is implemented. Admins manage users and permissions at `/admin/users`; sponsors maintain their assigned pages at `/sponsor`. See [role permissions](docs/ROLES.md), [website activation](docs/WEBSITE-ACTIVATION.md), and the [qualification records](docs/QUALIFICATION.md). The dedicated Supabase project is now created and migrated.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Database migrations are in `supabase/migrations`. Generate the explicit public demo SQL seed with `node scripts/generate-seed.mjs`; it creates no authentication accounts or attendee registrations. Use real confirmed content and a separate organizer bootstrap for production.

Read [architecture](docs/ARCHITECTURE.md), [deployment setup](docs/DEPLOYMENT.md) and [qualification status](docs/QUALIFICATION.md) before a live release. The current increment includes 86 SQL/domain tests, real-backend verification/sign-in burst measurements, and browser qualification records. Production SMTP delivery, the real attendee roster and final organizer logistics remain launch prerequisites; do not equate the recorded login benchmark with end-to-end signup delivery.
