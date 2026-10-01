# Event Beast

**One event hub. The agenda, the people, and the conversations between sessions.**

[![Event Beast quality](https://github.com/jzferrell26/event-beast/actions/workflows/quality.yml/badge.svg)](https://github.com/jzferrell26/event-beast/actions/workflows/quality.yml)

Event Beast is a mobile-first event website with a public event guide, a private attendee community, and an organizer console for managing the live experience. Built with **Next.js, TypeScript, and Supabase**, it is currently being delivered for **Momentum Builder LIVE 2026** with Cuantico AI.

The event website is the first deployment—not the limit of the product. A reusable commercial platform is planned after Momentum Builder. Multi-organization SaaS, self-service event creation, billing, and reseller packaging are **roadmap items, not shipped features**.

**[Open the event website](https://eventapp.momentumbuilder.com/)** · **[Organizer guide](docs/OPERATOR-CONSOLE.md)** · **[Qualification record](docs/QUALIFICATION.md)** · **[Post-event product roadmap](docs/POST-MOMENTUM-BUILDER-PRODUCT.md)**

## What Event Beast does

| Experience | Available capabilities |
|---|---|
| **Public event guide** | Full agenda and session details, speaker biographies, sponsor tiers and website links, sponsor creative placements, date-specific lunch/breakout options, venue/help, and device-local saved sessions. No account required to browse. |
| **Attendee community** | Verified event access, opt-in People directory and profiles, social-wall posts with editing/reporting, durable one-to-one messaging, unread badges, in-app message notices, and authorized profile photos. |
| **Organizer console** | Agenda/speaker editing, image uploads, sponsor/ad management, lunch and Fun Stuff content, private registration intake, user/role assignments, moderation, and a launch-readiness dashboard. |
| **Mobile and offline** | Phone-first navigation, keyboard-aware chat, optional Add to Home Screen, and a separate offline reader for previously cached public essentials. |

The social wall is shared with verified attendees; direct messages are not. Members manage their own posts. Admins can moderate the wall and review specifically reported private messages—not browse every conversation.

### Current event boundaries

Breakouts belong inside **Lunch**. **Fun Stuff** is organizer-editable and may show a pending state until content is supplied. Event announcements are disabled for this deployment; private-message indicators are separate in-app UI, **not lock-screen push notifications**. HighLevel handles mass texting. Nothing here sends event SMS.

The public site and organizer/community functionality have been deployed and tested. This does **not** establish complete 500-user concurrent capacity, automatic account-email delivery, final content approval, or venue-network readiness. See the dated evidence and remaining gates rather than treating the build badge as attendee-rollout approval.

## Architecture

```text
Public visitor / verified attendee / organizer
                    |
        Next.js App Router on Vercel
        UI + authenticated route handlers
                    |
        Dedicated Supabase project
        Auth | Postgres + RLS | Storage
                    |
        Private Realtime invalidation
        Clients re-read authorized data
```

Postgres is the authority for registrations, roles, consent, messages, read state, posts, and event content. Message/post idempotency keys prevent duplicate durable writes after a lost response. Realtime carries change notifications, not authoritative message bodies; reconnect and polling reconcile with the database.

**Privacy and authorization are part of the data model.** Authentication proves identity, an approved registration grants event access, and directory/messaging preferences control participation. CSV imports add private registrations; they do not create Auth accounts, send invitations, or publish profiles. Admin, Sponsor, and Member roles are event-scoped. Sponsor editing permissions apply only to explicitly assigned sponsors; the current public sponsor presentation remains a separate experience.

Attendee registration email, phone, and contact data stay Admin-only. Private photos use short-lived signed URLs. The application runtime does not use a service-role key. RLS and event-scoped relationships enforce authorization independently of the UI. Private APIs, messages, profiles, authentication, and organizer responses never belong in the service-worker cache.

Read [Architecture](docs/ARCHITECTURE.md), [Roles](docs/ROLES.md), and [Attendee rollout](docs/ATTENDEE-ROLLOUT.md) for the implementation contracts.

## Run locally

Use **Node.js 22.x** and the versions pinned in `package-lock.json`.

```sh
npm ci
```

Copy `.env.example` to `.env.local` **only if you do not already have a local configuration**. For an account-free, read-only development preview, leave the Supabase credentials blank and set:

```dotenv
EVENT_BEAST_DEMO_MODE=true
EVENT_BEAST_PUBLIC_SITE=true
EVENT_BEAST_EMAIL_READY=false
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

```sh
npm run dev
```

Open `http://localhost:3100`. Sample people, dates, and content are labeled; demo actions do not send real messages or publish changes. The demo is not the live event's content source.

For real authentication or writes, use an **approved isolated development backend**, apply the reviewed migrations, and configure the origins and credentials described in [Deployment](docs/DEPLOYMENT.md). Do not point an experimental local/preview app at the production database. A differently named deployment with the same backend is not isolated infrastructure.

## Checks

```sh
# Lint, TypeScript, database/domain tests, and production build
npm run check

# Install browser engines, then run current and compatibility suites
npx playwright install chromium webkit
npm run test:e2e
npm run test:e2e:legacy
npm run test:mobile:webkit
```

The test harness executes the migrations with PostgreSQL-compatible PGlite fixtures and separately checks browser behavior. Hosted qualification scripts exercise real services with scoped synthetic records. Neither is interchangeable with a load test, actual inbox delivery, or a physical-phone/venue-network test. Release provenance is available at `/api/release`; detailed evidence and limitations live in [Qualification](docs/QUALIFICATION.md).

## Pressure Monkey: capacity and recovery qualification

Pressure Monkey is Event Beast's reliability-testing workstream—not Netflix's infrastructure-termination tool. It is designed to qualify realistic attendee traffic, controlled connection/request failures, and separate application/database/asset recovery.

**Implemented now:** read-only preflight, strict run-manifest validation, production-target protection, resource-budget primitives, and an independent local watchdog rehearsal. These commands do not generate hosted load:

```sh
# Local source/configuration inventory; no network by default
npm run pressure:preflight

# Optional: four bounded, credential-free GETs to the current public aliases
npm run pressure:preflight -- --inspect-public

# Local guardrail tests and IPC-only watchdog/cancellation drills
npm run test:pressure
npm run pressure:self-test
```

`pressure:validate` and `pressure:dry-run` accept a manifest file for review. The bundled example is deliberately incomplete and must fail validation. A mechanically valid file is not proof of human approval. **Hosted prepare/run/cleanup adapters are not enabled in this slice**, and no flag turns the CLI into a production stress test.

The planned workload includes staged concurrency, arrival spikes, sustained usage, private-channel behavior, and recovery drills. Actual 500-session results remain unqualified until the approved environment, quotas, budget, fixture lifecycle, runner, and evidence gates are complete. Reports explicitly separate capacity, resilience, recovery, account email, and physical-device results.

See the [Pressure Monkey operator guide](docs/PRESSURE-MONKEY.md) and [PRD-002](library/requirements/in-work/prd-002-pressure-monkey-qualification/prd-002-pressure-monkey-qualification-index.md).

## Repository map

| Path | Purpose |
|---|---|
| `src/app/` | Public/member pages, organizer routes, APIs, and styles |
| `src/components/` | Event UI, community, messaging, organizer tools, and mobile behavior |
| `src/lib/` | Data contracts, authorization helpers, validation, and domain logic |
| `supabase/migrations/` | Reviewed schema, RLS, and RPC changes |
| `supabase/templates/` | Source templates for invitation, verification, and recovery email |
| `public/` | Brand assets, icons, service worker, and standalone offline reader |
| `scripts/` | Guarded content imports, hosted qualification, and operational tooling |
| `scripts/pressure-monkey/` | Read-only preflight and local safety-control implementation |
| `tests/` | Domain/database tests, browser workflows, and guardrail tests |
| `library/requirements/` | PRDs organized by backlog, in-work, and completed lifecycle |
| `docs/` | Architecture, operator instructions, release evidence, and product direction |

## Shipping this event, then building the product

Before opening an attendee wave, independently verify the approved roster, transactional sender and inbox delivery, current capacity, organizer content, physical devices, and venue connectivity. Keep `EVENT_BEAST_EMAIL_READY=false` until the account-email workflow is genuinely qualified. Do not change DNS, paid plans, provider limits, or production data as a side effect of running tests.

After Momentum Builder, use the actual event's lessons to productize reusable branding, module selection, event creation, organization/event tenancy, commercial entitlements, and repeatable launch qualification. See the [post-event roadmap](docs/POST-MOMENTUM-BUILDER-PRODUCT.md).

**Built for a real event. Being shaped into a repeatable product.**
