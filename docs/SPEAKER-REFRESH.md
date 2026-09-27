# Speaker portraits and biographies — September 27, 2026

## Requested correction

Speaker pages previously reused the attendee directory's small circular Avatar component. The original portrait files were intact, but square `object-fit: cover` presentation clipped tall photographs. The initial content import also replaced the published event biographies with hardcoded one-line descriptions.

Speaker directory and detail pages now use a dedicated `SpeakerPortrait` component. Each portrait is shown in a stable 4:5 frame with `object-fit: contain`, retaining the full source photograph. The image is absolutely positioned inside its reserved frame so a missing, loaded or replaced image does not change the frame height. The attendee avatar component is unchanged.

The directory uses three columns on desktop, two on medium screens and one on phones. Cards show the complete published introduction without a line clamp. Detail pages pair a larger portrait with the full biography, a public source link and the existing session links. Search continues to match speaker names, titles and biography text.

## Source-backed content

The current event website supplies 42 named speaker cards and their associated portraits. Existing speaker Garin Heslop is now included on that website; Eric Levin, Dustin Owen and Brody Lee are additional official profiles. Eric Levin is not treated as Eric Post.

The event's two remaining previously linked speakers were completed from their own published sources:

- Jay Jones: https://cuantico.us/about — the named Cuantico team portrait and a factual professional summary.
- Eric Post: https://ericpost-thoughts.huzihalo.com/about/ — a factual professional summary; the portrait comes from the founder section of https://www.huzilaunch.com/.

The resulting directory contains **44 speakers, 44 biographies and 44 headshots**. All 41 previous speaker IDs and all 30 existing speaker/session links were preserved. Published/unpublished decisions, attendee records, role assignments, registration, messaging, DNS and email configuration were not changed.

`data/official-speakers.json` and `data/supplemental-speakers.json` retain source URLs, image checksums and intrinsic dimensions. The event-scoped synchronization result is recorded in `docs/speaker-content-sync.json`.

## Repeatable import and checks

`node scripts/import-official-speakers.mjs` captures public speaker cards and preserves the name/image pairing. It rejects unexpected removals, duplicate names and unreviewed image hosts. It does not write to the database. `node scripts/import-speaker-supplements.mjs` prepares only the two reviewed supplemental records.

`node scripts/sync-official-speakers.mjs` is a dry run. Passing `--apply` uploads content-addressed portraits and atomically updates only the named event's speaker records. The sync verifies stored image checksums, refuses to overwrite an independently edited organizer biography, detects concurrent record changes and confirms that existing session links are unchanged. It does not reimport the event schedule or create attendee accounts.

New automated checks cover readable image assets, source-description checksums, distinct speaker identities, full biography visibility, biography search, uncropped portrait rendering, a stable missing-image fallback and recovery when a new image URL arrives. Fixture-only browser tests block service workers so production caching does not replace their synthetic guide; the independent offline tests retain normal service-worker coverage.

For deployed verification, run `node scripts/verify-speaker-pages.mjs`. It checks the exact deployed Git revision, all 44 public biographies, all 44 hosted image checksums/dimensions, both device layouts and selected detailed profiles. Reports and screenshots are written to the ignored `test-results/speaker-release` directory, not represented as an email-delivery or attendee-launch sign-off.
