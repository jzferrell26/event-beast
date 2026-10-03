# Bounded albums, Android HEIC and blank descriptions

See PRD-005 in `library/requirements/in-work/prd-005-bounded-photo-albums/` for Sonia's requests and the release gates.

## Photo workflow

Attendees can select up to **five photos per post**. A sixth is rejected before decoding. Preparation and upload happen one photo at a time with progress; retries resume the first unconfirmed slot under the same request ID. The database publishes only after every requested slot exists. An interrupted upload does not create a partially visible album. A changed draft uses a new request ID. Legacy single-photo/text posts and old publication clients remain compatible.

JPG/JPEG, PNG and WebP use native browser decoding. HEIC/HEIF is recognized from bytes, not only MIME labels; when native decoding fails, an isolated worker loads the pinned, same-origin `libheif-js@1.23.2` WASM bundle. HEIC decoding does not run on the app server or an external conversion service. The worker checks dimensions before RGBA allocation, converts only the primary image, and is terminated after success, cancellation or a 30-second timeout. Originals stay on the device. The fallback accepts HEIC up to 24 megapixels; extremely high-resolution originals show a standard-camera-mode instruction instead of unbounded decoding. Native formats retain the existing 25 MiB / 60-megapixel upper input limits.

Prepared and newly normalized images are at most **1 MiB** and 1920px on the longest edge (smaller if required to meet the byte limit). Existing stored 3 MiB images remain readable. Each HTTP upload contains only one file; actual multipart stream length is bounded, even without Content-Length. The private storage bucket's prior 3 MiB object ceiling and 200-object-per-attendee quota remain for backwards compatibility; application writes have the tighter derivative limit.

Each album displays one selected photo plus next/previous controls and a count, rather than eagerly loading all five images in every feed card. Composer previews are separate 320px thumbnails. Replies/likes remain at post level. Hiding the post withdraws every slot; Admin can review every slot. Ownership, two-way blocks, disabled accounts and sign-out are checked on each photo request.

## Server resource controls

Native image processing is bounded to two simultaneous jobs per process with eight waiting; excess requests receive a controlled busy response, not an unlimited queue. Immutable normalized derivatives may be retained for 60 seconds in a per-process cache capped at 16 MiB and 32 entries. Membership and post RLS are checked BEFORE cache access. All HTTP responses remain private/no-store; no media enters the service worker, public CDN cache or public/signed URLs. This cache reduces repeated image decoding without bypassing moderation or logout.

These are resource bounds, **not a guarantee that 500 simultaneous uploads will succeed**. The local noisy-photo workload records sizes, elapsed time and process RSS under `test-results/photo-capacity/result.json`. It does not measure Vercel autoscaling, database connections, venue Wi-Fi or end-to-end 500-user traffic. No hosted load/chaos experiment is run by this change.

## Other requested cleanup

The entire `In this session` section is omitted when a session description is empty/whitespace. Existing descriptions and organizer-written session data are unchanged. Sonia's separate GHL recipient-list, Saturday-email and no-text instructions were surfaced to Jonathan, not automatically executed.

## Verification

Local qualification: lint, TypeScript, the production build and 332 unit/database/API tests passed. All 42 focused Social Wall and Sonia-polish browser checks passed across desktop Chromium, phone Chromium and phone WebKit. The final pre-buffer upload-admission guard was separately rechecked with lint, TypeScript and 12 focused API/database tests. The local 20-image noisy workload completed with four callers in 8,656 ms; its largest stored derivative was 415,630 bytes. Full measurements and limitations are in `photo-album-local-capacity.json`. This is not a hosted 500-user test.

The genuine HEIC fixture exposed a missing worker OffscreenCanvas capability in the WebKit test browser. The fallback now transfers decoded pixels from the terminated worker to a bounded canvas encoder on the main thread. HEVC decoding still happens off the main thread; canvas conversion and drawing are not promised to be free of main-thread work.

Production migration `20261003011545_bounded_photo_albums` is applied. All five existing posts and the existing single-photo attachment were preserved. This schema preflight does not claim the new application is deployed; that requires the exact-revision hosted checks below.

Source tests cover count/path limits, all-or-nothing publication, retry identity, protected media, authenticated cache boundaries and queue shedding. Browser tests include actual HEIC decoding, five-photo selection, rejected sixth image, interrupted third upload, lazy album navigation and empty descriptions on desktop Chromium, mobile Chromium and WebKit. The fixture comes from the pinned upstream libheif example; the decoder and fixture license notices are retained.

After migration and exact-revision deployment:

`node scripts/qualify-social-wall.mjs --revision <full-production-sha> --run --album`

The small hosted test creates only its disposable Member/organizer identities and one temporary album. It verifies actual upload, all five private photos, likes/replies, moderation, blocking and sign-out. Cleanup uses only allocated test IDs and Storage API deletion. Jonathan/Sonia's existing uploads are not test data. Record hosted result on the PR; do not infer it from source tests.

Sonia's screenshot confirms a browser decoding error and her email confirms Android, but she has not supplied the original failing image. Her actual phone/file retest remains separate from HEIC fixture proof.

## Technical references

- Vercel function request/response limit: https://vercel.com/docs/functions/limitations
- Decoder API/source: https://github.com/catdad-experiments/libheif-js
- Sharp image validation/normalization: https://sharp.pixelplumbing.com/api-constructor/

Rollback keeps the additive schema; prior clients still show the first photo. No real photo deletion, auth changes, attendee-email send, paid provisioning or GHL changes are part of this release.
