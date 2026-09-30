# Mobile chat: incoming-message awareness, avatars and keyboard position

## User-reported defects

Jonathan's real-phone screenshots `IMG_0350`–`IMG_0357` show successful two-account messaging and correct Admin/Member wall moderation, but expose three missing behaviors: no new-message signal away from Inbox, initials instead of existing profile photos on feed posts and thread headers, and the conversation moving into empty space when the phone keyboard opens. He confirmed a preceding keyboard dismissal for the earlier Home overscroll report. Do not equate a refresh clearing the symptom with a complete physical-device fix.

## Focused changes

**Message awareness:** the app shell now owns one shared private Realtime invalidation subscription. A metadata-only, no-store unread summary counts all conversations, not just the first inbox page, and honors verified membership, event flags and bidirectional blocks. Inbox and a header message shortcut show an unread count. A newly received off-thread message produces a generic in-app notice linking to the conversation; it reveals no message text. Initial unread messages show a badge rather than a misleading new-arrival popup. Reading messages clears the count using server-confirmed read receipts. Repeated broadcasts, own sends, account changes and failed requests cannot invent new messages.

These are **in-app private-message indicators**, not the event announcements Sonia excluded. No SMS, email, browser notification permission, operating-system push, sound or closed-app delivery is introduced. If the browser is offline or suspended, the indicator refreshes after reconnection/foregrounding. Polling is retained as a fallback to Realtime.

**Avatars:** the feed now reads only its displayed authors' permitted headshot paths through the caller's existing RLS session. The one-to-one route also retrieves the permitted peer photo. Both render a private, short-lived signed URL. Exact event/attendee storage paths are checked; hidden, blocked, missing or inaccessible profiles keep the initials fallback. No public bucket, service-key runtime access, directory-consent bypass or extra contact fields are added. Wall moderation controls are unchanged.

**Keyboard position:** the former thread-height observer subtracted the thread's moving `getBoundingClientRect().top` while listening to root scrolling. A browser pan to the focused composer could therefore grow the page that was itself being scrolled. The regression combines keyboard-size reduction, a large visual-viewport offset and attempted document scrolling; it failed before the change.

The mobile conversation now occupies a fixed visual-viewport-sized shell. Only its message pane scrolls; the header, composer and navigation use a bounded flex layout. The root scroll lock belongs only to the active mobile thread and is released on navigation, desktop resizing or pinch zoom. Existing draft preservation, explicit Send, modal geometry, offline inset and rotation behavior are retained. There is no global scroll clamp for ordinary event pages.

Primary viewport references: [Chrome's VisualViewport explanation](https://developer.chrome.com/blog/visual-viewport-api/) and [VisualViewport geometry and events](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

## Verification and release gates

The initial source check passed lint, TypeScript, production build and 234 unit/database tests. New database tests verify incoming-vs-outgoing counts, confirmed reads, blocks in both directions, denied roles, cross-event isolation and more than 30 conversations. Photo tests verify minimal profile projections and storage path authorization.

The focused mobile regression verifies viewport height 360px with a 300px top offset, attempted root scrolling, an unsent draft and return to ordinary Home scrolling. Existing keyboard, offline, pinch-zoom, rotation and editable-modal checks pass in Chromium and WebKit. New photo and off-Inbox badge tests cover desktop, phone Chromium and phone WebKit. An arrival-test setup was corrected to wait for its empty baseline before injecting a new message; first-load unread state must not be reported as a new arrival.

Final suite and live test results are recorded separately. `scripts/qualify-mobile-chat-feedback.mjs` uses isolated synthetic accounts and their own messages/uploads; it must remove its exact records after testing and must not inspect or alter Jonathan's real conversation. It verifies actual signed photo responses and real off-Inbox unread delivery/read clearing. A successful simulated viewport test is not a claim that a physical iPhone keyboard was operated.

Apply only `20260930232159_message_attention_summary.sql` to the dedicated Event Beast project before deploying the reviewed app commit. No real registrations, roles, event content, domain records, email sender settings or messages are changed by the release.

## Physical-phone acceptance

Refresh both normal and private-browser test sessions after deployment. Stay on Home in one account and message it from the other: verify the Inbox/header count and generic notice without opening Inbox. Open the conversation, verify its peer photo, then focus/dismiss the keyboard several times, type a multi-line unsent draft, rotate and return to Home. Confirm the count clears after reading, feed photos match permitted profiles, and only the Admin account has wall-wide moderation controls. Keep the original Home overscroll issue open until this no-refresh physical sequence is confirmed.
