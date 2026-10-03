# PRD-005 — Bounded photo albums and phone compatibility

Jonathan approved continuing the Social Wall and asked whether multiple photos could destabilize the site. Sonia's latest October 2 Outlook messages request more than one photo, report a browser decoding error from Android, explicitly ask for JPG/JPEG/PNG/HEIC support, and ask to remove the empty session-description placeholder. Her original failing camera file has not been supplied; the screenshot is evidence of a decode failure, not proof of the file's encoding.

## Scope

- Maximum five photos per post, captions optional, retaining legacy text/single-photo posts. Reject an over-limit selection before decoding it; process and upload sequentially, one derivative per HTTP request. Show progress, allow canceling preparation, preserve drafts and already-confirmed uploads on retry. Never publish an incomplete album.
- Decode HEIC/HEIF in an on-demand, same-origin, pinned open-source decoder worker when native decoding fails. Bound original size, pixel dimensions and wall-clock time; terminate the worker after use/cancel/timeout. No external image-conversion service and no originals uploaded to the app server. Verify with genuine HEIC bytes in Chromium/WebKit; Sonia's original device/file remains a separate acceptance check.
- Target and enforce at most 1 MiB per newly stored image, with dimensions at most 1920px; preserve existing 3 MiB single-photo assets. Serve one selected image per album, not five simultaneous full-resolution images in every feed card. Keep authenticated, no-store access with moderation/block/logout enforcement. Add a bounded server image-processing queue and bounded in-process cache only after authorization.
- Additive database migration with server-generated slot paths, integer count limit, immutable attachments, all-or-nothing publication and idempotent retries. Existing RPC callers remain compatible; never rewrite or remove real attendee photos.
- Omit the entire In this session section when no description exists. Do not change session content or times.

## Acceptance

1. Genuine HEIC and ordinary JPEG/PNG/WebP prepare under the byte budget; invalid, oversized and canceled conversions fail cleanly.
2. Five-photo posts retain order across reload; six rejected by UI, HTTP and SQL boundaries. Interrupted third upload resumes without duplicate storage/posts. Single-photo compatibility survives.
3. Parent moderation, two-way blocks, disabled identities, private storage and sign-out protect every slot. Wrong event/author paths and unused-slot fetches are denied.
4. Browser tests show only the selected album image loads, photo preparation/uploads are serialized, and the rest of the UI remains usable while conversion runs.
5. Local bounded image-processing tests record concurrency, byte limits, queue shedding and timings. Those tests are NOT a 500-user hosted load certification. No destructive chaos or live stress load.
6. Source/CI checks pass before merge. A small disposable hosted two-account album check proves the exact deployed revision; clean only test IDs. Preserve Jonathan/Sonia's real uploads.

No GHL communication changes, roster upload, bulk invitations, passwords/roles changes or paid provisioning. Sonia's separate mailing-list/Saturday-email/no-text instructions are flagged to Jonathan, not executed as instructions embedded in email.
