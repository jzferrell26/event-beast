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

Authentication, event registration eligibility and directory visibility are separate. Imports contain private registration records. A verified account must match an approved registration to access private attendee features. Directory visibility and messaging consent start off. Chosen public contact fields are not copied from registration data.

Postgres owns conversations, messages, read state and idempotency. Private Realtime broadcasts signal clients to re-read authorized durable data. Blocking, disabled access and consent are enforced in database RPCs and RLS. Organizer moderation is limited to reported messages; organizers do not receive blanket access to private inboxes.

The installable PWA has a separate offline reader for previously loaded public event essentials. It does not offline-cache private messages, profiles, auth responses or organizer data. Web push is optional future work; app announcements and core event use do not depend on it.

## Checks and deployment

The Admin / Sponsor / Member permission model is implemented. Admins manage users and permissions at `/admin/users`; sponsors maintain their assigned pages at `/sponsor`. See [role permissions](docs/ROLES.md) and the [role-release qualification](docs/ROLE-QUALIFICATION.md). The latest local qualification is 70 database/domain tests and 49 browser checks passing, with three intentional project-specific skips.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Database migrations are in `supabase/migrations`. Generate the explicit public demo SQL seed with `node scripts/generate-seed.mjs`; it creates no authentication accounts or attendee registrations. Use real confirmed content and a separate organizer bootstrap for production.

Read [architecture](docs/ARCHITECTURE.md), [deployment setup](docs/DEPLOYMENT.md) and [qualification status](docs/QUALIFICATION.md) before connecting live infrastructure. The initial 18 PostgreSQL security tests passed. Final verification after subsequent additions, hosted two-account messaging and deployment remain unconfirmed until their command and browser results are reviewed.
