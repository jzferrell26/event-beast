# September 30: social wall, private messages, and authoritative event content

## Verified live handoff

PR #12 and the real-browser activation follow-up PR #13 are merged. Production revision `6208bf01d9aae557160f5b251a5d1cbb770a599c` is live. The approved event has community, feed, directory and messaging enabled; announcements are disabled and the automatic account-email gate remains closed.

The final hosted qualification passed all eight workflows on that exact revision with `diagnosticHeaderOverride=false`: fresh organizer/member activation, profile consent/contact privacy, two-browser social-wall persistence and idempotent retries, Admin-only moderation, durable private messages and blocks, recovery from a different-account session, unpublished organizer lunch editing, and actual public content. All synthetic identities and records were removed. This does not assert that Don or Sonia personally completed their first successful login.

Validation also includes 210 unit/database tests, 63 event-hub browser checks, 125 legacy browser checks (three intentional project skips), and 28 focused mobile-WebKit checks. The final independent CI workflow passed before PR #13 merged. A slow dependency-mirror CI attempt was canceled and rerun; no failing quality gate was bypassed.

After final qualification, new recipient-only recovery emails were sent to Sonia and Don from Jonathan's Outlook, and both Sent Items copies were verified. Each email explains the explicit Continue securely step, confirms the intended account, and distinguishes manual recovery from the still-disabled automatic email service. Private links are kept only in ignored local state, never in the committed evidence. See `september-30-organizer-recovery-handoff.json`.

Evidence: `september-30-hub-deployment.json`, `september-30-hosted-qualification.json`, `september-30-content-sync.json`, and `september-30-sponsor-links.json`. The current source import has 49 agenda entries, 16 lunch options, 37 sponsor listings, six ads and 34 source-backed sponsor website links. Fun Stuff content remains pending Sonia.

## Latest organizer direction

Sonia's latest **RE: event & community sites**, received September 30 at 15:10:38 UTC, requests a shared social wall and private messaging. Her preceding forwarded confirmation excludes notifications. She explicitly keeps breakouts in the Lunch pages and is preparing a separate **Fun Stuff** page. These instructions supersede the earlier separate Breakouts & Activities proposal.

The site keeps agenda, speaker, sponsor, lunch and venue information open without sign-in. The social wall, People, profiles and private conversations require a verified approved event registration. Wall posting explicitly shares the attendee's profile name and post with other verified event attendees; it does not expose registration email or phone. Directory visibility and messaging opt-ins remain separate choices. There is no public-to-the-internet contact directory.

## Implemented release

The social wall supports text posts, cursor pagination, manual/focus/visible polling refresh, draft retention and idempotent retry, author editing/removal, private reports and organizer hide/restore/report resolution. Moderator decisions cannot be undone by an author. Direct table writes cannot bypass the rate limit or mutate author/event/timestamps. Bidirectional blocks are enforced with a private database helper so reverse block visibility does not depend on the caller's own blocks-table RLS.

The event's announcement/notification bell, navigation, public announcement data and offline Updates tab are removed when announcements are disabled. This does not add SMS, push or email notifications. HighLevel remains the mass-texting channel.

Lunch is grouped by date and category (VIP, breakout, seating, food trucks), with the organizer's capacities, descriptions and supplied menu URLs. Fun Stuff has an organizer editor and a truthful pending screen until Sonia supplies its content; no activities were invented or copied into a second breakout area.

Email activation and recovery links no longer verify on GET or HEAD. The recipient first lands on a no-store confirmation page and presses **Continue securely**. Its explicit `strict-origin` response header and HTML meta policy preserve the form's Origin for the unchanged CSRF checks, while withholding the token-bearing path/query from Referer. Only that same-origin POST consumes the token. Links are redirected to the configured canonical host before cookies are created. A malformed/used link cannot sign out a valid existing session. Password setup displays the verified email and rejects an account change from another tab. The final handoff claims the event registration and routes Admins to the console and Members to their profile.

The first hosted check found that `no-referrer` could cause a navigation-mode form POST to send a null Origin and fail the CSRF guard. PR #13 corrects the policy rather than relaxing origin validation. A real-browser regression failed before that fix and passes after it. See the [Fetch standard's Origin behavior](https://fetch.spec.whatwg.org/#origin-header). Any hosted report with `diagnosticHeaderOverride=true` is diagnostic only and is not final release qualification; the final run must have that flag false.

## Source import policy

`data/september-30-program.mjs` captures Sonia's attendee-facing agenda (06:02:05 UTC), her corrected **RE: Lunch (Oct. 7)** (06:24:40 UTC), and **Lunch (Oct. 8)** (06:26:03 UTC). The earlier October 7 lunch message is not imported.

The guarded import contains 49 agenda rows and 16 lunch records. It preserves 37 existing session IDs, keeps all six sponsor ads, and remaps the one ad previously anchored to a superseded sponsor-spotlight session. It archives by unpublishing, not deleting, the old spotlight entry. A transaction compares captured row hashes/counts and refuses concurrent organizer edits. A committed-import marker prevents later reruns from replacing new edits.

Only seven rows have organizer-supplied explicit end times. The remaining 42 have an internal scheduling boundary required by the existing schema, but `end_time_confirmed=false` prevents those inferred boundaries from appearing as confirmed end times on the agenda, session detail, mobile summary or offline guide. Organizers can explicitly confirm a supplied end time in the atomic session editor.

Steven Petrov and Dan Catinella are named in the supplied panel descriptions but do not have matching speaker-profile records. Their names remain in the event copy; no biographies, photos or identities were invented. The original agenda source-review notes are retained rather than silently marked resolved.

Sponsor website links come from the captured official event site's linked logos. Existing organizer CTA links are preserved and changes use content-version guards. The captured Mack Financial logo points to Lendware; this mismatched destination is intentionally held for organizer confirmation, not propagated. Sponsors with no captured link remain unlinked.

## Release and qualification boundaries

Apply `20260930161331_event_hub_release_safety.sql` to the dedicated Event Beast project only. It adds event-level flags, lunch metadata, confirmed-end-time display semantics, and guarded social-wall writes. Community enablement is an explicit event setting after the reviewed application build is deployed. No tenant migration, billing, domain/DNS mutation or SMTP credential is included.

Repeatable validation:

```sh
npm run check
npm run test:e2e
npm run test:e2e:legacy -- --output test-results/legacy
npm run test:mobile:webkit
node scripts/sync-september-30-program.mjs
node scripts/sync-official-sponsor-links.mjs
```

The two sync commands above are dry runs unless passed `--commit`. After deployment and event enablement, `node scripts/qualify-september-30-hub.mjs` verifies the actual hosted flows with synthetic accounts and removes its temporary records. Reports explicitly distinguish browser fixtures from hosted Auth/HTTP/database operation and from real automatic inbox delivery.

**Still not an attendee-rollout sign-off:** automated invitation/signup/recovery email remains gated until the exact sending address is approved and independent-inbox delivery is tested. The connected Resend account has a verified `noreply.momentumbuilder.com` sending domain, but that is not itself an approved From mailbox or configured Supabase SMTP sender. The registrant cohort is not imported or invited by this release. Sonia's Fun Stuff content, remaining profile/link questions, the final branded-domain cutover, and physical-device/venue-network acceptance remain separate tasks.

The post-event commercial product plan remains parked. This release is the organizer's event scope, not a self-service SaaS conversion.

## Hosted advisory review

The September 30 security-advisor read returned the two existing anonymous-callable authorization helpers and 30 authenticated-callable guarded `SECURITY DEFINER` helpers, including the four new wall actions. These advisories are recorded, not represented as a zero-warning security scan; the wall RPCs have explicit verified-member/owner/Admin checks and direct table writes are revoked. Guidance: [anonymous helper exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated helper exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The advisor also reports **leaked-password protection disabled** in hosted Auth. This release does not silently change that Auth setting; it remains a pre-attendee-rollout configuration review alongside automatic email delivery. See [password-strength and leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The application's 12-character password requirement and identity/role tests do not claim to replace that provider-level check.
