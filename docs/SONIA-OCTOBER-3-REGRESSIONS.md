# Sonia's late October 2 regression fixes

## Source and scope

The prior photo-format/lunch/empty-description work is already merged in PR #28
(`a17184d`). This follow-up covers the two newer Outlook messages from
`team@momentumbuilder.com`:

- **Agenda glitch**, received October 3 at 03:10 UTC (October 2 evening Central):
  opening a Day 2 session and returning to the agenda resets the selected day to
  Kickoff.
- **Picture posting**, received October 3 at 03:38 UTC: the selected photo still
  fails. The supplied Android screenshots show a `.jpg` collage, 3072 x 4096,
  5.91 MB, and a browser file-read/permission error before the preview appears.
  This is not evidence of a server format rejection.

No roster, organizer content, schema, auth/RLS, SMS, or production configuration
changes are included. One photo per post and the existing photo formats remain
unchanged.

## Fixes

The agenda's selected day is represented by its `day` URL parameter. Changing
tabs replaces the current list history entry rather than adding back-button
steps. Browser back and reload recover that selection. A session's **Back to
agenda** link includes its actual day and session anchor, so cold deep links
also return to the correct date and position. Invalid/obsolete day IDs fall back
to the normal current-day selection. Keyboard tab selection follows the same
path. Lunch links remain date-specific.

The old photo change handler cleared the native file input immediately after
starting asynchronous preparation. On temporary phone photo-provider handles,
that can revoke access before the read completes. The handler now waits until
preparation finishes before clearing the input. The original is read once into
a bounded, in-memory File before format sniffing, object-URL decoding or HEIC
conversion, avoiding repeated access to the temporary device handle. Successful
preparation and failures both allow the same photo to be reselected.

Actual device read failures show actionable reselect/save-copy/Files guidance,
not a raw browser exception. Caption/previous preview state is retained. No
upload is attempted for an unreadable photo. The 25 MB original limit, local
resizing, server-side decoding/metadata stripping, private storage and
idempotent posting are unchanged.

## Qualification

Before rebuilding, all four new mobile Chromium browser regressions failed
against the previous build: the two agenda-return cases reset to the first day,
the modeled Android temporary-file permission case had no photo preview, and a
revoked read exposed the raw browser message instead of recovery guidance.

Post-fix lint, TypeScript, the production build, 333 unit/database tests and all
12 focused browser checks pass. See `QUALIFICATION.md` and the release pull
request for the broader-suite/CI and preview evidence as those checks complete.
Browser fixtures simulate Android provider revocation and generate a large
3072 x 4096 JPEG above the server transport ceiling. They verify local resizing,
same-file reselection, posting, failure recovery and caption preservation.
These tests do **not** constitute a physical-device retest of Sonia's exact
collage or a production upload. Her original photo was not attached; only
screenshots were provided. No production mutations or release are performed by
these tests.
