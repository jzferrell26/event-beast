# Momentum Builder LIVE 2026 — event-day handoff

## Release scope

This release prepares the existing Event Beast website and dedicated database for the event. The attendee website remains `https://event-beast.vercel.app`. Domain/DNS work is explicitly parked. SMS stays in HighLevel. No attendee invitations or marketing messages are sent by this release.

The public working guide is available, but **public registration must remain closed until transactional email is configured and tested in real inboxes**. A successful build, a green browser test, or an Admin checkbox does not establish email delivery or complete organizer content.

At the September 26 review, the connected email account allowed 100 sends per day, which is insufficient for 500 same-day first-time verification emails. The email team must confirm adequate provider and Supabase capacity before opening registration. No paid-plan change or alternate sender was configured in this release.

## What the organizer can control

Open `/admin/launch` after signing in with a verified, approved Admin account. The Launch Center separates deployment configuration, saved content, and organizer-recorded live checks. It also shows approved Members/Sponsors, total approved registrations, claimed accounts and pending access requests. A bootstrap registration is not a complete event roster.

The working-program review queue keeps the source sheet, row and original question private. To resolve an item, first correct the session in `/admin/agenda_sessions`. Publish the corrected session and record **Confirmed**, or leave it unpublished and record **Excluded**. Include who confirmed the decision and what changed. The decision is versioned and audited. Changing the reviewed session's attendee-facing fields reopens the decision rather than silently retaining an old approval.

Attendee email addresses, phone numbers and private contact records remain Admin-only. Members and Sponsors use opt-in profiles and private chat. Sponsor access grants editing only to explicitly assigned sponsor pages; it does not grant roster or private-contact access.

## Inputs still needed before attendee registration opens

| Gate | Required action | Where |
| --- | --- | --- |
| Transactional email | Configure an approved SMTP sender, sufficient provider/Supabase capacity, and real verification/resend/recovery delivery to two independent inboxes. Only then enable `EVENT_BEAST_EMAIL_READY`. | Supabase Auth and Vercel production settings |
| Organizer access | Verify and sign in using the designated Admin registration email. Confirm that the Admin can open the console. Do not bypass verified-email matching. | `/join`, then `/admin/users` |
| Full attendee list | Import the organizer-approved CSV, reconcile the count with the complete registration list and resolve missing/pending access. Imports create eligibility, not Auth accounts or invitations. | `/admin/attendees` |
| Working agenda | Resolve the nine held source questions, confirm session rooms and approve the complete program. | `/admin/launch`, `/admin/agenda_sessions` |
| Speaker assets | Supply approved headshots/biographies for the speakers still missing them. The previous import identified Eric Post, Garin Heslop and Jay Jones. | `/admin/speakers` |
| Sponsor details | Confirm all sponsor records, tiers, logos, booth locations and contractual agenda placements. The imported confirmed sponsor is Cuantico AI, Platinum. | `/admin/sponsors` |
| Lunch and venue | Supply final lunch times/locations/dietary information, room directions, welcome-desk location and an organizer-approved event map. | `/admin/lunch_locations`, `/admin/venue_locations` |
| Physical event checks | Use actual iPhone and Android devices on the venue network. Test sign-in, reconnect, keyboard behavior, messaging and the saved public offline guide. | Organizer verification records in `/admin/launch` |

No missing event detail should be replaced with an invented room, time, sponsor agreement or dietary promise. Unconfirmed sessions stay unpublished.

## Attendee arrival flow

The event link or QR code opens /join. Attendees use the email they want tied to their event account, choose a password of at least 8 characters, and verify the email code or link. Verified self-service users join as Members unless that email/account was explicitly disabled. They then choose whether to appear in the directory and receive private messages.

Normal-browser sessions persist. Private browsing, clearing browser data, sign-out or revoked access can require another sign-in. The attendee's own device is the recommended place to stay signed in.

A verified person missing from the roster can request access. The request stays pending until an Admin confirms registration. Sponsors and other attendees must not receive account passwords or a private-contact export to resolve access problems.

## Event-day support

**No verification email:** Check the sender's delivery logs and the attendee's inbox/spam folder before requesting another message. Confirm the exact registration email. Do not disable email verification or approve a different email merely to bypass a queue.

**Signed in but no attendee access:** Check the registration status and matching verified email under Attendees. A missing match can submit an access request. Disabled access must be explicitly reviewed by an Admin.

**Messages delayed after losing Wi-Fi:** Reconnect and reopen the conversation. The database retains message history and idempotency; a pending or failed send is not a confirmed delivery. The inbox refresh retains the loaded conversation window when older threads move to the top.

**No network:** Open the saved public offline guide. It contains previously loaded public essentials, not private inboxes, attendee profiles, Auth pages or organizer records. Save the guide and approved map before entering a poor-coverage area.

## Qualification and release evidence

Repeat `npm run check` and `npm run test:e2e` for the source release. `docs/QUALIFICATION.md` records the qualification scope. `docs/public-website-release.json` records the observed deployed commit, not a hardcoded historical revision.

The current source qualification is 121 automated SQL/domain tests and 67 browser passes with three intentional skips. `docs/hosted-release-regression.json` records seven additional real-service checks with four temporary, administratively confirmed synthetic accounts. This does not test email delivery. The scoped test runner is `node scripts/qualify-hosted-release.mjs`; a failed cleanup must be reconciled using its ignored state file and `cleanup` mode before another run. It never changes the production event or sender configuration.

The public `/api/release` endpoint returns only application identity, Git revision, demo/live mode and whether the email gate is open. It is not an infrastructure health check or proof of email delivery. The read-only `scripts/verify-public-website.mjs` checks that endpoint against the expected commit, then verifies public routes, anonymous private-API denial, accessibility and the public-only offline cache. It never signs up a person or sends an email.

The earlier 500-account benchmark measured synthetic verification, password sign-in and registration claims with throttling retries. **It did not qualify 500 public signups or delivery of 500 real emails.** Do not describe it as an end-to-end event-arrival guarantee.
