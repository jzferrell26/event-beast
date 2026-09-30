# Live organizer testing handoff

## September 29 release continuation (September 30 UTC)

Jonathan explicitly approved the public-site merge, database migration and Sonia's organizer provisioning. PR #8 is merged and its production revision is `3e9c126aef727bb3b421f30fc40948506b990d96`. The live public guide uses the real dedicated Event Beast project, not the read-only preview environment.

PR #9 is also merged and deployed at `5e297df3d6e93eeba1b36168c7e7fff1e3c8856f`. Both organizer defects described below are fixed. Final qualification on that exact production revision passed all six live organizer checks, including a fresh invite with **no diagnostic pre-claim**, actual upload storage, and real read/write authorization refusal. All temporary accounts and unpublished test records were removed. The production branch passed GitHub's complete quality workflow; local unit/database coverage is now 192 tests, with 45 public browser checks.

The content import is complete for the supplied sources: **37 sponsor-tier listings representing 34 unique sponsor names**, with 35 unique source logo files, and **six supplied advertisements**. Repeated companies in separate official tiers remain separate listings. Official visual row order, not raw HTML order, determined the import. All stored logo and creative bytes were verified after upload. Actual desktop Chromium, phone Chromium and WebKit public checks verified the live sponsor pages and all six agenda placements.

The initial ad positions are editable defaults distributed across the existing published program. They are not a claim that contractual placements have been approved. The full program's 33 published sessions and 44 published speakers are preserved. Unresolved imported schedule questions were not silently approved.

Source records and repeatable verification:

- `official-sponsor-import.json` records official tiers, per-tier ordering, logo sources and stored assets.
- `supplied-creative-import.json` records source files, asset hashes, preparation and initial agenda anchors.
- `live-public-content-verification.json` records actual hosted public-page and asset checks.
- `live-organizer-qualification.json` records actual deployed Auth, HTTP editor and Storage checks. Check `firstRenderClaimTested` before treating it as first-login qualification; diagnostic runs may deliberately pre-claim the synthetic account to isolate downstream failures.

## Organizer permission and activation

`team@momentumbuilder.com` has a private, approved Admin registration for **Sonia Le**. There was no claimed Admin in the event at provisioning time. A narrowly guarded, audited database-owner bootstrap created this one preapproved registration, matching the existing owner's bootstrap pattern. The transaction checked the dedicated event and original owner grant, refused conflicting existing records, recorded explicit owner authorization and did **not** mark any real identity as verified.

Activation must be delivered only to that recipient. Sonia must verify the invitation and choose her own password. Never click her invitation or manually mark her email as confirmed. After activation, the organizer console is `/admin` on the canonical event website.

The private activation email was sent from Jonathan's connected Outlook mailbox and its Sent Items copy was verified. Subject: **Momentum Builder LIVE — your organizer access is ready for testing**. `sonia-access-handoff.json` records the delivery action without the private token. At the last check, Auth recorded the email as verified but the event registration had not yet been claimed. This is **not** confirmation that Sonia herself has completed her first organizer login or saved an edit; the agent did not consume her invitation or supply her password.

Automated SMTP/verification/recovery email delivery remains gated off. A manually generated, single-use Supabase invitation can be delivered through Jonathan's existing Outlook mailbox without opening public attendee signup or changing the transactional sender. This is not a claim that the automated Forgot Password email flow is operational. An expired invitation should be replaced through the same controlled organizer process.

## Live-only defects found during qualification

The first server-rendered Admin request after a successful email claim could repeat the identical pre-claim membership GET and retain its earlier empty result. Reading the RPC-returned attendee ID, while retaining event and user ownership filters, fixes the read-after-write path without a role bypass. The regression fails on the original implementation.

The storage helper predated roster roles and allowed only legacy `event_admins`. It now uses the canonical current event Admin predicate, checks verified authentication and retains storage RLS and explicit authenticated-only execution. Its database regression proves the original refusal and covers Member, Sponsor, anonymous, disabled and cross-event denial. Migration: `20260930023733_organizer_asset_role_access.sql`.

The security advisor still reports the same existing pattern of two anonymous-callable policy helpers and 26 authenticated-callable guarded helpers; no zero-warning security claim is made. Relevant Supabase guidance: [anonymous helper execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated helper execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## What Sonia should test

Use the verified organizer account, edit a session and its speakers, save, reload, and check the public agenda. Edit a lunch location/time, then test a sponsor-logo or ad-image upload. The ad editor is **Sponsors > Sponsor ads & placements**. Form uploads require Save changes; row uploads save only the image field. Publish only organizer-confirmed information.

On a phone, check the full agenda, speaker biographies, sponsor tiers, ad readability and saved sessions. Favorites are device-local and do not require attendee accounts. For a last-minute update, verify both the saved organizer record and the refreshed public guide. Offline readers retain the last loaded public data until reconnection.

Remaining event-owner decisions are final schedule/logistics/map confirmation, review of default ad positions and the selected complete static NFTYDoor frame, and actual physical-phone/venue-network acceptance. The requested `live2026.momentumbuilder.com` DNS change is not part of these source/content/identity writes; the existing live addresses remain unchanged.
