# Event Beast: the next implementation slice

Canonical repository: `jzferrell26/event-beast`. Continue `feat/event-beast-launch` and draft PR #1. This is a single primary coding conversation; no agent workers.

## Outcome

Move the implemented event companion into a repeatable, reviewable release candidate for approximately 500 attendees. Preserve the Next.js, dedicated Supabase and dedicated Vercel architecture under Cuantico AI. SMS remains entirely in HighLevel.

## Slice 1 — organizer launch center

Add `/admin/launch` with checks computed from the actual event records: dates, welcome/support details, published agenda, session locations, sponsor configuration, lunch/venue information and remaining sample content. Each gap links to its editing section. The app must not mistake published sample content for a confirmed event program.

Persist explicit organizer verification for real email delivery/recovery, two-account messaging/reconnect, physical phone/offline use, final content/sponsor agreement review and representative shared-network testing. Record who saved each check, when and their notes. These are human-recorded checks, not automatically verified system claims. Restrict all reads/writes to event organizers, including direct database access. Demo changes remain read-only.

**Status: complete in the release candidate.** `/admin/launch`, durable organizer verification records, content-readiness checks, evidence notes, optimistic versioning and organizer-only RLS/RPC boundaries are implemented and tested. Demo mode remains preview-only.

## Slice 2 — connection and privacy reliability

Exercise message send, lost response, same-key retry and reconnect reconciliation. Receiving a successful send response must not move the catch-up cursor beyond missing incoming messages. Disabled attendee access and messaging consent must apply at every authoritative database boundary. Avoid repeated registration-claim writes for already linked accounts.

Keep profile data out of service-worker caches. Clear private client state after authorization rejection; refresh on reconnect. Inspect event-day selection, mobile touch targets and legibility during actual browser use.

**Status: complete in the release candidate.** The reconnect cursor regression is covered by dedicated unit and two-browser tests; attendee ownership/consent boundaries are hardened in migration `202609230007_registration_boundaries.sql`; private client views unmount when access is lost; event-day selection, touch targets and contrast were qualified in the browser suite.

## Slice 3 — repeatable qualification

Make browser tests start their own production server and shut it down. Use one test worker to limit local resource use. Cover agenda day/search/save behavior, directory search/privacy, organizer CSV validation, demo mutation refusal, launch-center state, offline cache contents and responsive layout. Inspect screenshots. Keep SQL/RLS tests separate from browser transport claims.

Add a GitHub Actions check that installs pinned dependencies, checks TypeScript/lint, runs database/domain tests, builds the application and runs the browser suite. Record exact results in `docs/QUALIFICATION.md`. A failed check blocks release readiness; it does not require rebuilding the whole application.

**Status: complete in the release candidate.** Local qualification is 54/54 automated tests and 37 Playwright passes with 3 intentional project-specific skips and 0 failures. The Playwright web server lifecycle starts and stops the production server successfully, and the GitHub Actions workflow mirrors the local quality gates.

## Slice 4 — live activation

Connect a dedicated Event Beast Supabase project, apply reviewed migrations and create the verified organizer membership. Set the dedicated Vercel project's environment variables and exact callback origins. Configure organizer-approved auth email delivery. Replace sample content with confirmed event details and import the approved registration roster.

Jonathan approved the $10/month dedicated Supabase project on September 23. Project `nyhzmazbfctuttizwnxp` is now created and migrated. Never create a duplicate or reuse Listing Studio/Cuantico SMS database credentials.

Run the hosted two-account messaging, recovery, offline and load checks against the deployed release. A passing local test suite or demo preview does not satisfy those live checks. Publish a production URL only after verifying its deployment, environment mode and backend configuration.

**Status: website activation implemented.** The dedicated backend is migrated; working agenda and official speaker content are imported; persistent sessions, Admin-only contacts, hosted-service browser checks and a measured 500-verification/sign-in burst are complete. Production SMTP/public-signup delivery, real roster/roles, final organizer logistics and physical-device/venue-network qualification remain. See `WEBSITE-ACTIVATION.md` and the machine-readable reports for the exact scope.

## Completion record

Update this file and `docs/QUALIFICATION.md` with the completed slice and the exact remaining dependencies. Push the reviewed code to the existing PR; do not leave the finished increment only on the local machine. Do not merge or label the attendee deployment production-ready while required live verification remains unperformed.
