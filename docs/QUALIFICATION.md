# Event Beast qualification record

This document distinguishes implemented behavior from verified operation. A successful source edit is not a production sign-off.

## Confirmed local qualification result

On September 22, 2026, the final local qualification run completed with typecheck passing, lint passing, 35 automated tests passing, the Next.js production build passing, and the Playwright browser suite passing seven desktop/mobile/offline checks with one intentional desktop skip for the mobile-only navigation assertion.

The PostgreSQL tests use PGlite with real PostgreSQL roles, RLS and RPC execution. They cover eligibility, verified-email claims, private profiles, conversation ownership, durable message idempotency, receipts, blocks, reports, organizer access, agenda operations, sponsor-placement constraints, imports and private storage paths. Domain tests also cover CSV parsing, event-timezone conversion, redirect boundaries, reconnect deduplication and constrained organizer schemas.

The browser suite verifies the main attendee experience, organizer demo controls, mobile bottom navigation and the public-only offline cache contract in a production Next.js build. Review screenshots were captured for mobile Home, Agenda, People and desktop Organizer Overview and visually inspected during this session.

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
```

Review every failing command. Do not suppress auth/RLS test failures or switch to a permissive policy to make a demonstration work. Run the production server on port 3100 to qualify service-worker behavior; development does not register the worker automatically.

Then run the Playwright browser suite and the screenshot review helper.

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

Dedicated Cuantico Supabase project cost approval and creation; migration application; organizer bootstrap; production email sender and callback allowlist; confirmed event content; real attendee import; dedicated Vercel project and production domain/environment configuration; two-account live browser checks; hosted Auth/Realtime/Storage verification; deployment verification.
