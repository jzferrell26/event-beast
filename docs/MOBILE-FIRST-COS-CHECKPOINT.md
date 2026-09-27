# Mobile-first work — COS update checkpoint

## Resume here

Jonathan is installing a Chat On Steroids update. Work is paused intentionally after saving this checkpoint, not because the mobile pass is complete. Resume the existing implementation; do not recreate the branch, reimport speakers, change the logo, or restart the event project.

- Repository: `jzferrell26/event-beast`
- Local workspace: `/cos-test/event-beast`
- Work branch: `feat/mobile-first-event-day`
- Base commit: `b71f9942087a0011d2b7ba30c337d7a3a0838060`
- Scope and acceptance criteria: `docs/MOBILE-FIRST-IMPLEMENTATION.md`
- This checkpoint is work in progress. Do not merge or deploy to production before completing verification.

## User-approved requirements

The whole mobile header should be black, with the exact official logo, white notification control and clear profile button. Desktop is approved and should remain visually unchanged. Complete the entire phone-first pass: tighter Home, accessible agenda controls, readable People/Speakers, keyboard-aware Inbox, obvious venue/help actions, larger tap targets, readable text and offline resilience. Work in this conversation; no workers/subagents. Preserve access control, private contacts, original portrait integrity, official logo bytes and all existing event content. No DNS, email-provider, billing or signup-gate changes are authorized by this styling pass.

## Implemented in this checkpoint, not yet visually qualified

- `src/app/mobile.css`: final mobile-scoped CSS layer, imported after branding. Black header, larger controls, compact Home, agenda bar, readable single-column people cards, smaller uncropped speaker portrait cards, messaging/venue/help/form improvements.
- `src/components/mobile-event.tsx`: mobile-only priority notices, a source-backed now/next card, and venue/saved/speaker shortcuts; integrated into Home without new network calls.
- `src/lib/mobile-event.ts`: pure published-session selection, timezone-aware date label and viewport calculations.
- `src/lib/mobile-viewport.ts`: coalesced visual-viewport/focus/resize handling, safe header offsets, and keyboard detection that distinguishes zoom.
- `src/components/use-thread-viewport.ts`: thread/composer space calculated from actual viewport, header and bottom navigation; wired into the existing thread screen without changing message persistence.
- `src/components/agenda.tsx`: sticky-control wrapper, mobile now/next jump, keyboard navigation for day tabs, focusable session anchors. Existing saves and sponsor placements retained.
- `src/components/more.tsx`: mobile venue help/offline shortcuts and copy-address action for published non-demo venue data.

## Verification completed

`npm run lint` and `npm run typecheck` both passed at this checkpoint. They do not establish browser behavior, production-build success, desktop parity or mobile readiness. Unit tests, production build, browser tests and post-change screenshots remain to be run for this branch.

Before source edits, `scripts/capture-mobile-baseline.mjs before` captured eight routes at 1440px and 390px with a fixed browser clock and synthetic demo data. No horizontal overflow was reported in those original views. The original 390px hero measured approximately 369px tall.

Baseline screenshots and JSON were archived outside Playwright's disposable output directory:

`supabase/.temp/mobile-first-baseline-before.zip`

The archive is deliberately ignored by Git, contains synthetic screenshots rather than secrets, and remains on this computer. Playwright may clear `test-results`; restore the archive to `test-results/mobile-first` before the after-comparison if needed. If resuming on a different computer, recapture the base commit in a separate checked-out workspace without discarding this branch's changes. The baseline capture server on port 3102 was stopped before the COS update.

## Next execution sequence

1. Inspect branch/status and this checkpoint after the update. Preserve any newer work. Read the implementation brief and relevant test contracts.
2. Add unit coverage for `eventMoment`, timezone boundaries, empty/invalid/unpublished sessions, concurrent sessions, keyboard-vs-zoom and viewport sizing. Add mobile interaction coverage for the 320/375/390/430/768px sizes, sticky controls, jump behavior, long labels, large targets, portrait integrity, copy-address failure, and keyboard resize/rotation.
3. Review existing speaker tests: earlier checks expected large directory portraits on both devices. Update only mobile size expectations to match the newly approved compact layout; retain contain/no-crop, complete biography, replacement recovery, source and session-link checks. Do not weaken desktop requirements.
4. Build the new source, run full tests and browser qualification, inspect real screenshots and fix defects. Verify safe-area spacing, editable modals, short landscape and reduced-motion handling. Keep the existing two-account messaging/retry/privacy tests.
5. Restart one local synthetic server as needed, restore the baseline archive if Playwright cleared it, then run `scripts/capture-mobile-baseline.mjs after`. It reports exact desktop changed pixel channels. Investigate every desktop difference; do not simply loosen the comparator.
6. Once qualified, update the brief/qualification record, create a focused PR, wait for CI, merge and verify the actual production revision on the existing Event Beast aliases. Distinguish emulated device checks from physical iPhone/Android or venue-Wi-Fi tests.

## Useful commands

PowerShell 5.1 requires `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`, not `&&`. The baseline script accepts `EVENT_BEAST_CAPTURE_ORIGIN` and `before`/`after`; default local origin is port 3102. Existing app tests normally start on port 3100. Do not reuse an old `.next` build when claiming the new styles are verified, and do not run competing builds/browser batches.
