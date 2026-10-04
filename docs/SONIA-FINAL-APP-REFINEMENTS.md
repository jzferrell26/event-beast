# Sonia's October 3 evening app refinements

## Source and scope

Sonia's two follow-ups to **Your remaining changes: homepage and site updates
are live** confirm that picture posting worked and request a final app polish
pass. Jonathan approved the app updates. The separate **Three feet from gold**
marketing email is not part of this change.

## Acceptance checklist

- More has ten rows in this order: Meet attendees, Private messages, Social
  wall, Impact Partners, Full agenda, Saved sessions, Meet the speakers,
  Lunch & breakouts, Fun Stuff, Help, Venue, and More. The profile/privacy row
  is removed from that list, not from the app: the signed-in header avatar
  still opens My profile, and the top private-message shortcut remains.
- Help replaces **Keep the guide handy.** with **Keep this site handy.**
  All four card headings use the same display font, size and weight. The
  primary card icons use the existing Wi-Fi red. The email, text and
  registration-table lines use identical typography and retain their mailto
  and SMS destinations. Styles are scoped to the public Help grid.
- The organizer-supplied Hyatt description becomes **Our main ballroom is on
  the lobby level, you can’t miss it!** This is a targeted content update to
  the existing venue row, not a hardcoded override or schema change. The
  address, directions, floor-plan PDF and other venue fields are preserved.
- Speaker ads retain the organizer's published order (Xactus, Figure, Total
  Expert). The first follows speaker 14, the second speaker 28, and the last
  follows the remaining speakers. Short/search lists clamp the breaks to
  their end so eligible ads are not lost; no-results searches show no ads.
  Additional configured ads remain at the end. No sponsor rows or contracts
  are changed.
- Home ends with a full-content-width black panel headed **WHY VISIT THE
  IMPACT ARENA**, near the Welcome heading's size. Its exact body is:
  **Meet our incredible partners, discover new products and services, grab
  breakfast, win prizes, and more... Your next connection could be waiting
  in the Impact Arena.** Existing homepage ads render once before this panel.

## Boundaries and verification

Photo handling and the validated Day 2 navigation code are unchanged. There
are no auth, RLS, schema, attendee, SMS, private-message or campaign-email
changes. No production post or test attendee is created.

The four new browser regressions were run against the preceding production
build and failed for the old More order, old Help heading, missing Impact
Arena panel and speaker-ad positions 3/6/9. The new suite checks the exact
copy/order, computed typography/colors, responsive panel dimensions,
preservation of profile access and sponsor ordering, including search cases.
The existing broader suites continue to cover photo and agenda behavior.
Final test and production results are recorded on the release pull request.
