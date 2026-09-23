# Event Beast qualification record

This document distinguishes implemented behavior from verified operation. A successful source edit is not a production sign-off.

## Confirmed local qualification result

On September 22, 2026, the current release-candidate qualification completed with typecheck passing, lint passing, **54 automated database/domain tests passing**, the Next.js 16.3.6 production build passing, and the expanded Playwright suite passing **37 checks with 3 intentional project-specific skips and 0 failures** across desktop and mobile Chromium. Playwright also successfully started and stopped its own production Next.js server on port 3100, which is the same lifecycle used by CI.

The PostgreSQL tests use PGlite with real PostgreSQL roles, RLS and RPC execution. They cover eligibility, verified-email claims, private profiles, conversation ownership, durable message idempotency, receipts, blocks, reports, organizer access, agenda operations, sponsor-placement constraints, imports and private storage paths. Domain tests also cover CSV parsing, event-timezone conversion, redirect boundaries, reconnect deduplication and constrained organizer schemas.

The browser suite verifies the main attendee experience, organizer demo controls, mobile bottom navigation, agenda day switching/search/saves, directory search/privacy/saves, attendee CSV preview and duplicate validation, guided onboarding, demo mutation refusal, the Launch Center, responsive phone width, the public-only offline cache contract, and durable two-browser messaging behavior. The messaging fixture applies the actual migrations/RLS through PGlite and covers lost-response retry with one durable row, reconnect catch-up, the cursor regression where a newer local send must not skip an older unseen peer message, reload history and blocking.

Accessibility checks use `@axe-core/playwright` against Home, Agenda, People, Inbox, Help, Organizer Overview, Launch Center and Auth in both desktop and mobile projects with WCAG A/AA tags. The current built application reports **0 axe violations across those 16 route/profile combinations**. Updated screenshots for mobile Home, Agenda, People, Inbox and Launch Center plus desktop Organizer Overview and Launch Center were captured and visually reviewed; no unintended horizontal overflow, overlapping layout or broken navigation was observed.

The dedicated Cuantico AI Vercel project already exists at https://event-beast.vercel.app and is intentionally configured as a labeled demo preview until the dedicated Supabase environment is approved, created and qualified. The previously deployed committed baseline was hosted-qualified successfully. The current Launch Center/reliability/accessibility increment must be committed, deployed from a clean revision and rerun against the hosted alias before this record treats the new revision as hosted-qualified.

The managed Supabase Auth, Storage and Realtime interfaces are represented by small database shims in the local PostgreSQL suite. Local qualification therefore does not establish successful hosted email delivery, WebSocket transport, production storage upload behavior or the required two-real-account messaging check.

## Automated checks for repeat qualification

Run:

```sh
npm ci
npm run icons
node scripts/generate-seed.mjs
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Review every failing command. Do not suppress auth/RLS test failures or switch to a permissive policy to make a demonstration work. Run the production server on port 3100 to qualify service-worker behavior; development does not register the worker automatically.

Then run `node scripts/capture-review.mjs` and visually inspect the generated review images. GitHub Actions repeats lint, typecheck, unit/database/domain tests, build, Chromium installation and the full Playwright suite on every pull request and push to `main`.

## Browser checks

Qualify a narrow phone viewport, a wider phone, a tablet and desktop. Inspect screenshots as well as the DOM. Verify no unintended horizontal overflow, usable bottom navigation, readable agenda metadata, 44-pixel touch targets, keyboard access, focus visibility and dismissible dialogs.

Visit Home, both agenda days, session detail, People search and filters, saved sessions, sponsor details, lunch, venue, notifications, profile, help and every organizer section. Confirm sample content is unmistakable. Confirm organizer edits are constrained and failed writes remain visibly unconfirmed. Test malformed, duplicate and valid attendee CSV files and the import preview before committing.

## Required live two-account messaging qualification

Create two verified test accounts and approved registrations in the dedicated Event Beast test environment. Use two independent browser contexts. Enable the attendees’ own directory and messaging preferences. Establish a conversation and verify that a message is persisted before it is marked sent. Reload both contexts and confirm durable history and read/unread states.

Disconnect one browser, send messages in the other, then reconnect. Confirm missing messages are reconciled in order without duplication. Force a response failure after the database has accepted a message and retry with the same client ID. Confirm one durable row. Verify pending and failed UI states. Try a reused client ID with changed text and confirm rejection.

Test blocking in both directions, reporting a selected message, disabling registration, opting out of messaging and restoring access. Confirm the organizer can see the reported message but cannot browse unrelated private conversation history. Confirm unrelated accounts cannot fetch conversation IDs, read private headshots or subscribe to another attendee’s private channel. Repeat checks against direct URLs and direct API requests.

## Offline and load qualification

Load the public guide on an installed/controlled production build, then disconnect. Verify the standalone offline reader shows agenda, sponsors, lunch, venue/map and active announcements with its saved timestamp. Inspect Cache Storage and confirm there are no private API responses, attendee records, messages, auth responses, admin pages or cached app HTML. Confirm the offline composer cannot report a message as sent.

Exercise concurrent sign-in and first-load traffic at a representative level for approximately 500 attendees, with staggered and burst patterns. Observe Supabase auth/email limits, database connections, Realtime subscription counts and Vercel errors. The local SQL test suite does not qualify this operational load.

## Launch prerequisites still requiring external configuration

The dedicated Vercel project is already created. Remaining live gates are: explicit approval for the quoted **$10/month dedicated Event Beast Supabase project**, project creation, migration application, organizer bootstrap, production email sender and callback allowlist, confirmed organizer event content, real attendee import, Vercel environment connection to that dedicated backend, two independent real-account messaging/recovery checks, hosted Auth/Realtime/Storage verification, representative shared-network/burst testing and physical iPhone/Android install/offline checks. Do not switch the public alias out of demo mode until those checks are complete.
