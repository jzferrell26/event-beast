# Official Momentum Builder logo

The shared `Brand` component uses the organizer-provided image, not the former CSS-generated MB mark and wordmark. This covers the desktop attendee sidebar, mobile header, sign-in/signup, organizer console, sponsor workspace and setup screen. The standalone public offline reader uses the same image.

- Source: https://momentumbuilder.com/wp-content/uploads/2026/05/Momentum-Builder-Live-2026_dark-background-1000.png
- Local asset: `public/branding/momentum-builder-live-2026.png`
- Original dimensions: 1000 × 359 pixels
- SHA-256: `cd1d4ad52b9441750f1517f01a34a4a3d4013a83400dd8484337ad1c3d9ad86b`

The file is copied byte-for-byte. It is not generated, cropped, recolored, re-encoded or stretched. A dark CSS backing on light headers preserves the legibility of this dark-background logo's white lettering. The logo's home link remains keyboard-accessible. Attendee profile initials and installed-app icons are separate and are not changed by this header-logo replacement.

`data/event-brand.json` records provenance. `tests/event-brand.test.ts` checks the exact bytes and original dimensions. `tests/e2e/event-brand.spec.ts` checks shared app placements, image proportions, narrow phone layouts and offline availability. The read-only `node scripts/verify-event-brand.mjs` verifies the exact deployed revision and original image, captures live screenshots and writes its results under `test-results/brand-release/`.

No domain, email-sender, account, event-content or database configuration is changed by this release.
