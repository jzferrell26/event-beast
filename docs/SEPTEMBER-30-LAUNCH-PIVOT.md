# September 30 launch pivot — principal event hub

## Decision and supersession

Don's September 30 morning direction supersedes the September 29 information-only decision. Momentum Builder LIVE 2026 will use Event Beast as its **principal event hub**, including registrant accounts, attendee profiles and attendee-to-attendee communication. Eric's separate permanent platform is not the event communication hub; it will be offered/teased separately as the paid-member technology.

Do not delete the September 29 public-site work. Agenda, speakers, sponsors, lunch, venue and other event information should remain easy to browse. The pivot adds authenticated attendee/community capabilities back to that event experience.

## Source-of-truth rules

- Don's September 30 email controls attendee/community scope: load registrants, communication, profiles; evaluate/build a feed; sponsor links; Add to Home Screen UX; Breakouts & Activities; Kachina organizer access.
- Sonia's September 30 **agenda** email is the attendee-facing agenda source. Missing session titles stay missing/generic until she supplies them; do not invent titles.
- For October 7 lunch, Sonia's **RE: Lunch (Oct. 7)** email saying “Sorry, use this one” supersedes the earlier October 7 email.
- Sonia's **Lunch (Oct. 8)** email is the October 8 lunch source.
- HighLevel remains the mass-texting system. Do not build SMS sending into Event Beast.
- Organizer changes made after these source emails must not be silently overwritten by an import. Use guarded/version-aware imports and record source provenance.

## P0 — authentication before attendee rollout

Sonia and Don both reported activation/password problems. Sonia also reported Forgot Password failing. Before importing/sending registrant activations:

1. Reproduce a fresh invite on the exact production domain/callback flow.
2. Verify invite -> password setup -> first login -> claimed event role -> destination.
3. Verify Forgot Password -> real email delivery -> recovery link -> new password -> fresh login.
4. Ensure an already-authenticated browser opening an invite does not consume or confuse the wrong account. Activation must make the target email/role explicit and handle existing sessions safely.
5. Move auth callbacks/links to the final branded origin when that domain is cut over; do not strand tokens on the temporary Vercel hostname.
6. Keep bulk attendee invitations paused until transactional email capacity and independent-inbox delivery are proven.

## P1 — authoritative event information

### Agenda

Load Sonia's September 30 public agenda exactly as supplied, preserving event-local times, rooms/locations and titles that are actually confirmed. The agenda includes kickoff/Impact Arena, morning activities, meals, book signings, raffles, extended breaks/puppies, panels and event conclusions. Do not infer missing titles.

### Lunch

October 7:
- VIP optional buffet + Leadership Panel in Marsalis Hall A.
- Cuantico breakout in Cumberland K; boxed lunch, first come/served, 50 lunches / 60 seats.
- Marsalis Hall B seating.
- Food trucks and organizer-supplied external menu links.

October 8:
- VIP optional buffet + Wealth Building Panel in Marsalis Hall A.
- Breakouts: Angelica Ventrice @ Cumberland J (30 lunches / 40 seats); Neel Dhingra @ Cumberland K (70/70); Braincode Centers @ Cumberland L (50/60).
- Marsalis Hall B seating.
- Food trucks and organizer-supplied external menu links.

## P1 — Breakouts & Activities

Add a first-class attendee destination for activities that should not disappear inside the main agenda. It must be organizer-editable and event-scoped. Initial content comes only from confirmed agenda/logistics sources:

- morning workout/walk/run/meditation/yoga meetups;
- Paint the Town Red kickoff party;
- lunch breakout sessions;
- book signings;
- puppies / extended-break activity;
- other parties and activities supplied by the organizer.

Support date/time, title, type, location, description, host/speaker links, capacity/availability copy where supplied, and publication/order. Do not invent RSVP functionality unless requested.

## P1 — attendee accounts, People and profiles

Restore attendee authentication for this event while preserving public event-information pages where practical. Registration eligibility remains separate from Auth. Importing a registrant must never publish their email/phone.

- Bulk registrant import is private and event-scoped.
- Attendees activate against their registration email.
- Profiles remain private/default-hidden until the attendee explicitly opts into directory visibility.
- Public/member profile projections never expose registration email, phone or private website/contact fields.
- Sponsor representatives can be associated with sponsors without automatically gaining sponsor-edit permissions.
- Add to Home Screen remains optional; this is still a web/PWA experience, not an App Store download.

## P1 — private messaging

Re-enable the existing durable 1:1 messaging system after auth qualification. Preserve:

- Postgres as authoritative message storage;
- idempotent client message IDs;
- Realtime as invalidation, not message authority;
- unread/read state;
- blocking/reporting;
- retry/reconnect behavior;
- event isolation and directory/messaging privacy settings.

Run two-browser and mobile tests against the deployed event before inviting the attendee cohort.

## P2 — event feed

Don explicitly asked for a feed. This is new launch scope and must be intentionally bounded.

Initial feed: event-scoped authenticated posts with author identity, text, timestamps, chronological ordering, pagination, and moderation/reporting. Admins can remove/hide posts. Attendees can create/edit/delete only their own content. Block relationships apply to feed visibility where appropriate.

Do **not** add DMs into feed records, expose attendee contacts, build algorithmic ranking, or add reactions/comments/media until the base feed is stable unless Don explicitly prioritizes them.

## P1 — sponsors

Use the sponsor CTA/link fields already supported by the data model to add confirmed sponsor website destinations. Links must be HTTPS and organizer-reviewed. Do not infer a destination from a logo/domain name when no official link has been supplied.

Vendor self-service profile creation is a separate workflow from attendee profiles and sponsor edit permissions. If enabled, use invitation/assignment rather than an open public sponsor-edit signup.

## Organizer access

Sonia and Don remain Admins. Add Kachina only after resolving her exact email/identity from the organizer; do not guess it. Admin access is event-scoped, audited, and protected by the existing last-Admin safeguards.

## Launch gates

Do not call the community pivot ready until all of these are evidenced:

- organizer invite + recovery works through real inboxes;
- member activation works through a real inbox;
- imported registrants are private before activation;
- People/profile privacy tests pass;
- 1:1 messages persist across reload/reconnect and two browsers;
- block/report authorization passes;
- feed RLS/moderation/event-isolation tests pass;
- no authenticated/private API responses enter the service-worker cache;
- desktop Chromium, mobile Chromium and mobile WebKit pass;
- organizer agenda/lunch/activity edits save and reload;
- synthetic users/content/uploads are removed after hosted qualification;
- bulk email capacity is proven before cohort invitation.

## Post-event product boundary

The broader sellable Event Beast roadmap remains in `POST-MOMENTUM-BUILDER-PRODUCT.md`. Multi-tenant SaaS, billing, reseller controls and generalized onboarding remain post-event. The attendee/community features above are launch requirements for Momentum Builder, not permission to start the SaaS migration during event week.
