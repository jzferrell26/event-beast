# Event Beast — mobile-first event-day implementation

Approved scope: Jonathan requested the complete mobile pass on September 27, 2026. Desktop is approved and must retain its current presentation. Implement now; no design-only handoff or replacement logo generation.

## Outcome

A person holding a phone in a hallway should be able to find the next session, its location, an attendee or a message without navigating through a desktop-sized introduction. The official Momentum Builder artwork remains byte-for-byte unchanged. This is an experience release, not approval to open registration, change DNS/email, import private contacts or approve unfinished organizer content.

## Acceptance checklist

| ID | Area | Implementation and acceptance |
| --- | --- | --- |
| M01 | Mobile header | Full-width solid black header at the existing mobile-shell breakpoint (900 CSS px or less); original logo sits directly on it; white notification icon, readable profile control, 44px-or-larger targets, notch padding. Desktop sidebar/header remain unchanged. |
| M02 | Home | Reduce hero height, remove redundant mobile promotional copy, surface an honest now/next session with time/date/room and quick venue/saved-agenda access. Urgent/important organizer updates precede promotional content. No fabricated live session, countdown, room or event claim. |
| M03 | Agenda | Sticky day/search controls under the measured header; horizontally scrollable day tabs; one-tap now/next jump; clear saved filter, readable times, room and end time. Preserve all agenda placements and save behavior. Long titles wrap. |
| M04 | People | Readable, single-column phone cards with clear names/company, accessible profile and save targets, easy search/filter chips. Keep server pagination/debouncing and opt-in visibility; never expose contacts. |
| M05 | Speakers | Faster-scanning phone cards without cropping any portrait; complete published biographies remain available, full profile links preserved. Desktop speaker grid stays unchanged. |
| M06 | Inbox | Readable thread list and timestamps, large options/retry/send controls, composer kept inside the visual viewport when the keyboard opens. Preserve draft during resize/rotation, newline behavior, history, receipts, blocking and idempotency. Pinch zoom must not be mistaken for a keyboard. |
| M07 | Venue/lunch/help | Surface existing directions, map, public address and help/offline entry points. Copy-address feedback when supported. Unknown maps, rooms and dietary guidance remain explicitly unconfirmed. |
| M08 | Shared mobile polish | Minimum 44x44 primary touch targets; 16px form fields; readable secondary copy; reflow at 320px; safe bottom spacing; no content trapped beneath navigation; short landscape and reduced-motion behavior. |
| M09 | Speed/resilience | No new UI library, external font, tracking, provider, login or public API request for the mobile dashboard. Reuse downloaded guide data and lazy images. Keep private data out of offline storage. |
| M10 | Qualification | Capture desktop baselines before source edits. Verify 320, 375, 390, 430 and 768px plus desktop. Test time boundaries, empty/held program data, keyboard resize/zoom, long labels, filters, image failure and offline guide. Run full check/browser suites and deployed production checks. |

## Design and implementation boundaries

Use a final, media-scoped `mobile.css` layer rather than rewriting shared desktop styles. Mobile-only controls are hidden on desktop and do not duplicate IDs or active tab stops. Store the brief and test evidence in this repository. Use synthetic fixture data for private browser paths; do not create or message real attendees for visual tests. Verify the existing domains without changing their configuration.

Reference standards: the 44px target is the chosen enhanced touch-size design target, not a blanket claim of WCAG AAA conformance. See https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced. Visual viewport handling follows https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport; test scale, resize and scroll rather than assuming every height change is a keyboard.

## Release record

Implementation and exact results will be recorded after qualification. Browser emulation does not replace a final physical iPhone/Android and venue-Wi-Fi rehearsal. Existing email, roster and organizer-content launch gates are separate from this pass.
