# September 30: social wall, private messages, and authoritative event content

## Latest organizer direction

Sonia's latest **RE: event & community sites**, received September 30 at 15:10:38 UTC, requests a shared social wall and private messaging. Her preceding forwarded confirmation excludes notifications. She explicitly keeps breakouts in the Lunch pages and is preparing a separate **Fun Stuff** page. These instructions supersede the earlier separate Breakouts & Activities proposal.

The site keeps agenda, speaker, sponsor, lunch and venue information open without sign-in. The social wall, People, profiles and private conversations require a verified approved event registration. Wall posting explicitly shares the attendee's profile name and post with other verified event attendees; it does not expose registration email or phone. Directory visibility and messaging opt-ins remain separate choices. There is no public-to-the-internet contact directory.

## Implemented release

The social wall supports text posts, cursor pagination, manual/focus/visible polling refresh, draft retention and idempotent retry, author editing/removal, private reports and organizer hide/restore/report resolution. Moderator decisions cannot be undone by an author. Direct table writes cannot bypass the rate limit or mutate author/event/timestamps. Bidirectional blocks are enforced with a private database helper so reverse block visibility does not depend on the caller's own blocks-table RLS.

The event's announcement/notification bell, navigation, public announcement data and offline Updates tab are removed when announcements are disabled. This does not add SMS, push or email notifications. HighLevel remains the mass-texting channel.

Lunch is grouped by date and category (VIP, breakout, seating, food trucks), with the organizer's capacities, descriptions and supplied menu URLs. Fun Stuff has an organizer editor and a truthful pending screen until Sonia supplies its content; no activities were invented or copied into a second breakout area.

Email activation and recovery links no longer verify on GET or HEAD. The recipient first lands on a no-store, no-referrer confirmation page and presses **Continue securely**. Only that same-origin POST consumes the token. Links are redirected to the configured canonical host before cookies are created. A malformed/used link cannot sign out a valid existing session. Password setup displays the verified email and rejects an account change from another tab. The final handoff claims the event registration and routes Admins to the console and Members to their profile.

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
