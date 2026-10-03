# Social Wall interactions and sign-out

Source request: Sonia's October 2 **big thing needed** email thread, followed by Jonathan's approval to implement and his request for an obvious logout control. Specification: `library/requirements/in-work/prd-004-social-wall-interactions/prd-004-social-wall-interactions-index.md`.

## Attendee experience

The Social Wall supports text posts, **one photo per post** with an optional caption, one-level replies, and like/unlike counts. Sonia explicitly confirmed on October 2 that one photo is enough; multiple-photo albums are not part of the launch release. Camera/library photos are prepared on the device and previewed before posting. Selecting a photo never publishes it. JPG/JPEG, PNG, WebP and HEIC/HEIF are accepted. When a browser cannot decode HEIC natively, a pinned same-origin decoder worker converts it locally before upload; the original never goes to an external conversion service. The server re-encodes the bounded derivative to WebP, strips metadata and rejects disguised content.

Client preparation targets at most 1 MiB and 1920px. Server image work is concurrency/queue bounded and authenticated photo responses use a small in-process byte-bounded cache only after authorization; browser/CDN responses remain private and no-store. This release does not include video, multiple-photo albums or replies to replies.

Photo/post/reply retries reuse their original request identity. Like retries set the desired state rather than toggling. Failed drafts remain in memory while the user stays on the page; they are not promised to survive closing/reloading the browser. Replies load newest history first, display chronologically and allow earlier pages without losing a typed draft on refresh.

**Sign out** is visible in the attendee header, at the top of More, on My Profile and in the organizer header. It calls the existing same-origin Auth endpoint with local-session scope. Only confirmed success clears in-memory identity and navigates to a fresh sign-in document. Other same-origin tabs receive a non-sensitive storage notification. Restored browser-history documents reload instead of reusing old private UI. Failed sign-out displays an error instead of claiming the account is logged out.

## Organizer moderation

Admin → Social wall displays attached photos with the existing post reports and hide/restore controls. The Reply moderation section supports reply reports and hide/restore. A hidden parent suppresses its photo, replies and likes for Members; restoring a reply alone does not restore its parent. Member edits cannot reverse organizer hiding. Existing audit logging and two-way blocking remain authoritative in the database. Private conversations are not included in the moderation feed or altered by these features.

## Data and storage boundary

The additive migration creates `feed_replies`, `feed_likes`, `feed_reply_reports`, a private `event-feed-photos` bucket and `feed_posts.image_path`. Composite event keys, verified membership, community/feed switches, ownership, request identity, optimistic versions and explicit grants are enforced below the UI. The old three-argument text-post function remains compatible with the prior release.

Photos use immutable event/author/request paths. Publication and unused-upload removal share an advisory lock. The bucket accepts only WebP with a 3 MB object limit and a serialized 200-object allowance per attendee. The app serves photos through authenticated `/api/feed/[id]/photo` responses with `private, no-store`, rechecking storage access and decoding bytes. No public/signed photo URLs or private Cache API entries are produced by this feature. Device originals stay local; preparation accepts up to 25 MB / 60 megapixels and transfers a smaller derivative.

An attendee may intentionally post without opting into the separate People directory or private messaging. The wall's audience is the signed-in community; open verified-email self-service is not proof of a purchased ticket. Names supplied for posts/replies are intentional posting identities, not private contact projections. No email, phone or personal website fields are added to Member/Sponsor responses.

## Qualification and release

Source checks cover actual PostgreSQL migrations/RLS through the existing PGlite harness, image decoding, HTTP authorization, idempotency, moderation, blocking, disabled identities, private media and local-scope sign-out. Browser tests exercise the actual built UI with controlled HTTP fixtures on desktop Chromium, phone Chromium and phone WebKit. Those fixture checks are not hosted Auth/Storage proof.

After deploying the reviewed revision and migration, run the narrowly scoped hosted qualification:

```text
node scripts/qualify-social-wall.mjs --revision <full-production-commit> --run
```

This creates only disposable identities (administratively issued test links, no outbound mail), two Member browser contexts and a temporary organizer. It verifies real uploads, second-account visibility, reply/like retry/reload, moderation, blocking and session sign-out. It deletes only its allocated post, photo, membership and Auth IDs; real attendee content is not test data. The result is recorded in `test-results/social-wall-live/result.json`. Keep production qualification, physical-phone camera/keyboard acceptance and 500-user capacity testing as separate claims.

No bulk roster messages, email configuration, SMS, event content imports, paid project provisioning, domain change or hosted stress test is part of this release. Roll back the app without removing the additive schema; the existing organizer feed switch remains the pause control.
