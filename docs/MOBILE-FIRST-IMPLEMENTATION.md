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

The full mobile implementation is qualified locally: lint, TypeScript, production build and **142 unit/domain/asset tests** pass. Chromium reports **109 browser passes and three intentional project-specific skips**; the focused WebKit phone suite reports **20 passes and no skips**. The matrix includes 320, 375, 390, 430 and 768 CSS-pixel layouts, unchanged desktop controls, long unbroken labels, full portraits/biographies, independent bookmark taps, day-key navigation, clipboard denial, keyboard/rotation/reconnect draft preservation, zoom discrimination, safe-area offsets and editable modal bounds.

All eight 1440px desktop routes matched the original `b71f994` baseline **pixel-for-pixel, with zero changed color channels**: Home, Agenda, People, Inbox, a conversation, Speakers, Venue and Join. The 390px synthetic Home hero decreased from 368.97px to 237.89px (about 36%), putting the current/next session immediately beneath it rather than below the promotional grid. The source-backed mobile views reuse the already downloaded public guide; new shortcut links do not speculate navigation requests.

The header measurement uses border-box ResizeObserver data, including safe-area padding, and detects streamed/replaced shell elements. Losing connectivity does not replace the viewport observer. Long speaker names and venue labels wrap rather than widening the phone viewport.

WebKit 1.63 offline emulation rejects service-worker responses before the worker can supply them ([upstream issue 42775](https://github.com/microsoft/playwright/issues/42775)). The WebKit regression therefore stops an isolated local origin after caching the actual shipped worker, reader and logo; it verifies that the guide still renders and that a fresh uncached browser cannot reach that origin. Chromium retains normal offline-emulation coverage. No production service is stopped for this test.

`docs/mobile-first-qualification.json` records the local results. After merge, `scripts/verify-mobile-release.mjs` checks the exact production revision, original logo bytes, closed email gate and real public layouts on both browser engines when `EVENT_BEAST_VERIFY_WEBKIT=true`. It writes fresh evidence under `test-results/mobile-release`; `scripts/verify-public-website.mjs` separately checks the deployed public-only offline guide and private-API denial. These read-only scripts do not create attendees, send mail/messages or change event settings.

Browser and geometry emulation do not replace a final physical iPhone/Android and venue-Wi-Fi rehearsal. Existing email, roster and organizer-content launch gates are separate from this pass.

### Preserved desktop accessibility finding

The first deployed audit found the existing desktop venue ordinal (`.venue-number`, pale `#d4d4da` on white) below the large-text contrast threshold, at approximately 1.47:1. This color is present in the original approved desktop baseline, and the pixel comparison confirms it was not introduced by this release. Desktop appearance is explicitly out of scope for redesign. The production verifier records this exact finding rather than silently excluding it or claiming full desktop conformance. Every mobile accessibility finding and any other desktop finding still fail verification. The venue title, address and directions remain available; this outstanding desktop contrast item is documented, not marked fixed.
