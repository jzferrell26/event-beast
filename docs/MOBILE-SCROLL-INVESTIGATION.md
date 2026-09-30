# Intermittent blank space below mobile navigation

> **Follow-up:** Jonathan supplied a reproducible keyboard-opening/panning symptom in private chat and confirmed a prior keyboard dismissal. A combined viewport-pan/root-scroll browser regression failed with the original thread-height feedback loop; the scoped chat-shell fix is documented in `MOBILE-CHAT-FEEDBACK.md`. This does not retrospectively claim the original Home gap was reproduced on a physical iPhone. Its physical acceptance remains open.

## User observation — September 30, 2026

Jonathan supplied conversation screenshot `IMG_0349.png` from the live
`eventapp.momentumbuilder.com` Home page. It shows the footer and bottom
navigation far above the bottom of the screen, with a large empty area below.
He then confirmed the problem stopped after refreshing.

**Status: open / intermittent; not reproduced in the focused browser check.**
Refreshing is a reported workaround, not evidence that the cause is fixed.
Whether a keyboard, browser-toolbar transition, app switch or earlier route
triggered the state is not yet known. Do not label this a confirmed Safari
defect or apply a global scroll lock to hide it.

## Focused check

The read-only public-site check at 2026-09-30T23:10:46Z exercised Chromium and
WebKit mobile contexts, one browser at a time, across six states per engine:
initial Home bottom, Home after search focus and viewport restoration, More
after client navigation, browser-back to Home, landscape, and restored portrait.
All twelve samples had no document overflow beyond the app shell and no gap
between the bottom navigation and the emulated viewport bottom. The local
report is `test-results/mobile-scroll-check.json`; its repeatable read-only
script is `test-results/mobile-scroll-check.mjs`.

This does not reproduce a physical iPhone keyboard, elastic overscroll or native
browser chrome. No production layout, scrolling, viewport or auth behavior was
changed as a result of this check.

## Physical-device acceptance still required

On the affected phone, navigate Home -> Agenda, focus and dismiss search,
return Home without refreshing, then scroll to the bottom. Also check return
from Feed/Inbox text entry, browser history, rotation and foregrounding the
browser. Capture the preceding action when the gap recurs. A fix requires a
reproducible failing state and a passing retest without refreshing; normal
content scrolling, message drafts, accessibility zoom and keyboard dismissal
must remain usable.
