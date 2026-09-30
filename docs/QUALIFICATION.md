# Event Beast qualification record

This document distinguishes implemented behavior from verified operation. A successful source edit is not a production sign-off.

## September 29 final organizer scope confirmation

Sonia confirmed the event website should have **no People directory, chat/messaging, attendee profiles, or in-site notifications/announcements**. Their permanent community is the attendee communication product and mass texting is the live-event notification channel. Event Beast is the public information website for this event, not a required-download app. The existing messaging implementation is intentionally not exposed by the production public-site mode. Commercial product expansion is parked in `POST-MOMENTUM-BUILDER-PRODUCT.md` and must not creep into the Momentum Builder launch.

## September 29 approved live testing release (September 30 UTC)

PR #8 and follow-up PR #9 are merged. The current tested production revision is `5e297df3d6e93eeba1b36168c7e7fff1e3c8856f`; both sponsor-creative and current-role storage migrations are applied to the dedicated Event Beast backend. Source verification passes **192 unit/database tests** and **45 public browser checks**. GitHub's full quality job passed before the organizer fix merged.

Actual hosted qualification passes **six organizer workflows** against real deployed HTTP, Auth and Storage: fresh invite/password setup/direct Admin entry with no diagnostic pre-claim, atomic session/speaker persistence, actual image upload/patch/reload, draft ad/lunch writes, anonymous/Member refusal, and recovery-token password reset/fresh login. All synthetic accounts, unpublished rows and temporary upload objects were cleaned up. This separately fixes the first-render membership read and the old storage helper's missing roster-Admin support. Earlier local fixtures did not detect these two live failures; both now have regressions that failed before their fixes.

The real content sync and **eight hosted public-content checks** confirm 37 tier listings (34 unique sponsors) in the visually confirmed official order and all six supplied ad images across desktop Chromium, phone Chromium and phone WebKit. All stored image bytes and public asset responses were verified. The complete Braincode PDF page and a complete static NFTYDoor GIF frame were prepared without changing ad copy. Ad positions are initial editable defaults requiring organizer review, not contractual sign-off.

Sonia's approved private Admin registration is provisioned, and the recipient-only activation email was sent from Jonathan's Outlook with a verified Sent Items copy. Auth email verification is recorded, but her first event-Admin claim and saved edit are not yet confirmed. No real person's verification or password was supplied by the agent. Automated SMTP/verification/recovery email delivery remains gated; manual token-flow tests do not certify real automated inbox delivery. Existing DNS, final logistics/held program decisions, and physical-phone/venue-network acceptance remain separate. Current evidence is linked from [LIVE-ORGANIZER-HANDOFF.md](./LIVE-ORGANIZER-HANDOFF.md).

## September 29 public information-site candidate (September 30 UTC)

Sonia's account-free public-site request is implemented with Home, Agenda, Speakers, Sponsors and More, local-device session bookmarks, retired community routes/APIs, a simple logo-and-tier sponsor page, and square/banner image ads for agenda and public pages. The latest full-agenda request supersedes the earlier condensed proposal. Organizer editing remains secured; no live account or content approval is inferred from a successful form preview.

**Source qualification:** lint, TypeScript, production build and **184 unit/database tests** pass. The dedicated public-site suite reports **45 passes, zero skips and zero failures** across desktop Chromium, mobile Chromium and mobile WebKit, including database-backed session/lunch/ad save/retry/reload, fixture upload previews, public privacy boundaries, scoped accessibility and offline essentials. WebKit offline operation is checked against the actual worker on a stopped isolated origin, with an uncached negative control. Synthetic fixtures are not hosted Auth/Storage verification.

**Current production facts, independently queried read-only:** the September 29 session-editor migration is already applied. The new sponsor creative columns are not yet applied. The event has 33 published sessions, 44 published speakers, one published sponsor and zero published ad placements. The intended `team@momentumbuilder.com` organizer has no event registration yet. No production mutation, account invitation, DNS change or new production deployment is certified by this candidate.

The separate legacy rollback regression passes **125 Chromium checks with three intentional skips**, and the focused legacy mobile WebKit suite passes **28 checks with no skips or failures**. The test checklist, supplied-creative inventory, source-order reference and precise remaining handoff gates are in [`PUBLIC-SITE-TESTING.md`](./PUBLIC-SITE-TESTING.md). The previously recorded community release checks below are historical and do not restore People/Inbox to the new public-site scope.

## September 29 event operator console (PRD-001)

The approved increment completes speaker/sponsor list and form uploads plus session-speaker editing in the existing organizer console. List uploads now save only the image field instead of overwriting newer row content. The session form searches/selects speakers and atomically commits its fields and existing join-table links through the additive `admin_save_agenda_session` RPC. Missing link data blocks saving. The existing event timezone, RLS, composite foreign keys, audit trail, review-reopen trigger and guide invalidation are preserved.

**Source qualification:** lint, TypeScript, production build, **174 automated tests in 22 files**, **121 Chromium browser passes with three intentional skips**, and **26 mobile WebKit passes with no skips**. New tests cover actual image decoding/re-encoding, the exact 3 MB boundary, image-only HTTP mutations, wrong-event and role refusal, approved roster Admin access and immediate disabled-account denial, anonymous RPC grants, draft visibility, link identity/idempotency, full transactional rollback, and desktop/mobile edit/retry/reload workflows. Scoped axe scans of the session and speaker dialogs passed, as did the existing fixture-based accessibility suite.

The first full Chromium run exposed an existing guide-refresh test reading transient duplicate DOM. Its assertion now waits for one visible updated summary without changing the attendee implementation. The full suite was rerun clean. Browser session persistence uses the actual PostgreSQL migrations/RLS via PGlite with synthetic data; upload transport/storage are fixtures while Sharp decoding is real. This does **not** claim hosted Auth/PostgREST/storage or physical-device verification. Historical production-only findings below are not cleared by these local results.

Evidence, exact browser run statistics, source fingerprints, and visually reviewed desktop/mobile screenshots are in [`library/requirements/in-work/prd-001-event-operator-console/qa`](../library/requirements/in-work/prd-001-event-operator-console/qa/implementation.md). The operator guide is [`OPERATOR-CONSOLE.md`](./OPERATOR-CONSOLE.md).

**Production boundary:** this work does not apply the migration, deploy to production, or assign `team@momentumbuilder.com`. Apply `20260929154113_event_operator_session_save.sql` to the existing dedicated Event Beast project before releasing the new editor, then verify real organizer saves/uploads, role denial and attendee refresh. Production Admin assignment/verification is the separate `/admin/users` operator step defined by the PRD. Door check-in, attendee layouts, official logo, help copy, public contact privacy, messaging, SMS, domains and email-launch settings are unchanged. The PRD remains `in-work` until release and the actual handoff are recorded.

## September 27 mobile-first event-day release

The resumed mobile pass implements the approved black mobile header, compact now/next Home, priority notices, sticky agenda/search/day controls and jump action, readable attendee/speaker browsing, full uncropped portraits and biographies, larger touch targets, keyboard-aware conversations, and venue/help/offline shortcuts. All changes to visual presentation are scoped to the existing mobile breakpoint. The official logo and speaker source assets are unchanged; no database migration, content import, email/DNS/billing change or signup activation is part of this release.

**Source qualification:** lint, TypeScript, production build, **142 unit/domain/asset tests**, **109 Chromium browser passes with three intentional skips**, and **20 focused WebKit passes with no skips**. The regression matrix exercises five phone/tablet widths, real browser hit testing, date/time boundaries, unpublished content, long text, clipboard failure, viewport resize/panning/zoom, rotation, connectivity changes, modal bounds and private-data boundaries. Existing paired messaging/database retry/read/blocking tests remain green.

**Desktop parity:** eight fixed-clock synthetic routes at 1440px match the pre-change baseline pixel-for-pixel (zero changed color channels). Mobile screenshots were visually inspected. The 390px Home hero is 237.89px tall versus 368.97px before the pass. This is a layout measurement, not a network-speed or arrival-capacity benchmark.

**Offline WebKit qualification:** an upstream Playwright 1.63 offline-emulation defect ([42775](https://github.com/microsoft/playwright/issues/42775)) also rejects literal service-worker responses. The test instead shuts down an isolated local origin after caching the actual application worker/reader/logo, verifies the public guide remains usable, and checks that a fresh uncached browser fails against the stopped origin. Chromium uses the existing offline flag tests. Neither method claims physical-device or venue-network testing.

Local evidence is in `docs/mobile-first-qualification.json`. Release-specific production checks are performed after deployment by `scripts/verify-mobile-release.mjs` and `scripts/verify-public-website.mjs`, with fresh results under `test-results/mobile-release`. The operational email, complete roster, organizer-content and physical-device launch checks remain separate.

The deployed desktop venue scan exposed one pre-existing contrast item outside the mobile redesign: the pale decorative `.venue-number` has about 1.47:1 contrast on white. Its original color and appearance are retained in accordance with the explicit desktop-preservation requirement. The deployed verifier records this exact baseline finding separately, while continuing to fail all mobile accessibility findings and other desktop findings. This release does not claim a clean full-desktop accessibility audit; see `MOBILE-FIRST-IMPLEMENTATION.md` for the disposition.

## September 27 official app-logo replacement

The placeholder MB mark and CSS wordmark were replaced by the exact organizer-provided PNG linked in `docs/OFFICIAL-EVENT-LOGO.md`. SHA-256 and original 1000 × 359 dimensions are tested. The shared sidebar, mobile, authentication, Admin and Sponsor headers preserve the complete logo; the standalone offline reader caches the same public image. No generated artwork, event settings, account configuration or database records are involved.

Lint, TypeScript, production build and **126 SQL/domain/asset tests passed**. The full browser suite reports **83 passes, three intentional skips, and no failures**, including all shared logo placements, 320-pixel phone layouts, unchanged home-link navigation and the offline original image. Desktop/mobile screenshots were visually inspected. Live release-specific verification is performed by `scripts/verify-event-brand.mjs` and recorded under `test-results/brand-release/`; local results alone do not certify a deployment.

## September 27 speaker portrait and biography correction

The speaker-specific layout passes lint, TypeScript, the production build, **124 SQL/domain/asset tests**, and **77 desktop/mobile browser checks with three intentional skips and no failures**. Tests cover uncropped 4:5 portraits, complete biographies, source links, biography search, existing session links, and stable missing-image/replacement behavior. Agenda session speaker previews use the same uncropped image component while retaining their compact horizontal layout; directory styles are isolated from those previews. Accessibility coverage includes the speaker directory and detail views. The attendee directory's shared avatars were not changed.

The source-backed content sync completed with **44 speakers, 44 biographies and 44 portraits**: 42 profiles from the official event site and two previously linked speakers supplemented from their own published company/author pages. All 41 existing speaker IDs and 30 session links were preserved. See `docs/SPEAKER-REFRESH.md` for sources and repeatable verification and `docs/speaker-content-sync.json` for the database-sync result. The deployed browser verifier writes fresh release-specific evidence under `test-results/speaker-release`; these source tests alone do not assert a production deployment.

## September 26 event-day readiness increment (September 27 UTC)

The release candidate passes **121 SQL/domain tests**, lint, TypeScript and the production build. The complete browser suite passes **67 checks with 3 intentional project-specific skips and no failures**, including 24 route/device accessibility scans with no axe violations. The new inbox regression was first reproduced against the prior build: a 60-conversation window became 59 after an older thread moved to the top. It now preserves all loaded pages and refreshes older metadata and access removals on desktop and mobile. Deployed public-route verification also identified insufficient sponsor-tier text contrast; it was corrected, and both sponsors-page device profiles are now included in the accessibility suite.

Launch readiness now distinguishes actual deployment configuration, roster counts, saved content and organizer-recorded checks. A closed email gate cannot be overridden with a manual checkbox. The nine imported schedule questions have an Admin-only, versioned and audited decision workflow; attendee-facing edits reopen a completed decision. No real schedule question was approved on the organizer's behalf.

Both migrations `20260927030552_agenda_review_decisions` and `20260927031040_harden_anonymous_rpc_permissions` were applied to the dedicated backend after local tests and a dry run. All **12 migrations** are present. The permission regression harness explicitly reproduces hosted default function grants, rather than assuming that revoking PUBLIC also removes explicit anon grants.

Seven fresh tests against actual Supabase Auth, Postgres, private Realtime and Storage passed. They cover verified synthetic registration claims, private profiles, anonymous RPC denial, durable message retry/read state, blocking, Admin program decisions and reopening, private storage, refresh tokens and disabled membership. Four synthetic accounts and their isolated event/uploads were removed after the run. See `docs/hosted-release-regression.json`. These are real-service API checks, **not** public signup, mailbox delivery, physical-phone or full browser tests. An earlier qualification attempt received a private-channel subscription error; the subsequent complete run successfully received actual private broadcasts. The app's reconnect path remains part of browser qualification.

The post-migration security advisor reports two anonymous-callable SECURITY DEFINER helpers (`can_read_event` and `is_event_admin`) required by public-guide SELECT policies, down from twenty. Twenty-six authenticated-callable helper/RPC warnings remain; these are guarded by current event membership, ownership or organizer authorization and are covered by authorization tests. Trigger functions are no longer directly executable by anonymous or authenticated clients. This is not a claim of zero advisor warnings. Advisor references: [anonymous function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The production working guide still contains 33 published sessions, nine held source questions, 41 speakers and 38 headshots. The complete attendee roster, claimed organizer access, final sponsor/lunch/map details and physical venue-device checks remain outstanding. Domain/DNS work is deferred by the project owner. Transactional sender setup and real-inbox delivery qualification are still required; account email remains gated. Consult `docs/EVENT-DAY-HANDOFF.md` for organizer actions. Deployment provenance and post-deployment results are recorded separately in `docs/public-website-release.json`; historical records below are not new sign-offs.

## September 23 website activation increment

The paid project approval is recorded and the dedicated Supabase backend is created with all ten migrations applied. Current results: **86 SQL/domain tests**, **57 browser passes with 3 intentional skips**, TypeScript, lint and production build all pass. Eleven real-service browser checks also pass against dedicated Supabase Auth, Storage, private Realtime and Postgres; see `docs/hosted-website-qualification.json`. The 500-account benchmark completed verification, sign-in and membership-claim phases; see `docs/hosted-auth-burst.json` and its explicit exclusion of public signup/email delivery. Speaker/schedule import and remaining live prerequisites are recorded in `docs/WEBSITE-ACTIVATION.md`. Earlier results below are retained as historical qualification records.

## Confirmed local qualification result

On September 22, 2026, the current release-candidate qualification completed with typecheck passing, lint passing, **54 automated database/domain tests passing**, the Next.js 16.3.6 production build passing, and the expanded Playwright suite passing **37 checks with 3 intentional project-specific skips and 0 failures** across desktop and mobile Chromium. Playwright also successfully started and stopped its own production Next.js server on port 3100, which is the same lifecycle used by CI.

The PostgreSQL tests use PGlite with real PostgreSQL roles, RLS and RPC execution. They cover eligibility, verified-email claims, private profiles, conversation ownership, durable message idempotency, receipts, blocks, reports, organizer access, agenda operations, sponsor-placement constraints, imports and private storage paths. Domain tests also cover CSV parsing, event-timezone conversion, redirect boundaries, reconnect deduplication and constrained organizer schemas.

The browser suite verifies the main attendee experience, organizer demo controls, mobile bottom navigation, agenda day switching/search/saves, directory search/privacy/saves, attendee CSV preview and duplicate validation, guided onboarding, demo mutation refusal, the Launch Center, responsive phone width, the public-only offline cache contract, and durable two-browser messaging behavior. The messaging fixture applies the actual migrations/RLS through PGlite and covers lost-response retry with one durable row, reconnect catch-up, the cursor regression where a newer local send must not skip an older unseen peer message, reload history and blocking.

Accessibility checks use `@axe-core/playwright` against Home, Agenda, People, Inbox, Help, Organizer Overview, Launch Center and Auth in both desktop and mobile projects with WCAG A/AA tags. The current built application reports **0 axe violations across those 16 route/profile combinations**. Updated screenshots for mobile Home, Agenda, People, Inbox and Launch Center plus desktop Organizer Overview and Launch Center were captured and visually reviewed; no unintended horizontal overflow, overlapping layout or broken navigation was observed.

The dedicated Cuantico AI Vercel project is deployed at https://event-beast.vercel.app and remains intentionally configured as a labeled demo preview until the dedicated Supabase environment is approved, created and qualified. The Launch Center/reliability/accessibility release candidate was deployed from the clean GitHub branch head and the full hosted Playwright suite passed **37 checks with 3 intentional project-specific skips and 0 failures**. GitHub Actions run `35814790173` also completed successfully for the qualified branch head.

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

The paid backend and dedicated Vercel project now exist. Remaining event-day gates are production SMTP delivery and actual public-signup qualification, the real attendee roster and role assignments, organizer confirmation of held schedule/logistics details, and physical iPhone/Android and venue-network checks. The public working agenda and speaker website can be released with email signup explicitly gated; opening signup requires verified email delivery. Consult the current website-activation record above rather than the historical demo-only status.
