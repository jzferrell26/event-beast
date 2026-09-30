# Public event guide: testing handoff

## Scope and source of truth

This candidate implements Sonia's September 28-29 Outlook requests. Don's latest request is the **full agenda**, not the earlier condensed sponsor-slot proposal. The existing published program is retained. No held session or unconfirmed schedule question is silently approved.

The attendee experience is now an account-free information site. Its main navigation is **Home, Agenda, Speakers, Sponsors, More**. People, Inbox, attendee profiles, community sign-up and sponsor-representative pages are retired from this experience. Existing private records are not deleted. Their old app entrypoints redirect, and their community API entrypoints return a non-cacheable 410 response. Organizer authorization and private contact protections remain in place.

## What to test

1. Open Home, Agenda, Speakers and Sponsors in a fresh/private browser. No attendee account is required. Check desktop and phone layouts, including the black mobile header and original event logo.
2. Open a session, bookmark it, reload **More > Saved sessions**, and remove it. Favorites are stored on that device/browser, not in an attendee account. They do not sync between devices and are lost when browser storage is cleared.
3. Check sponsor tier/order and full uncropped logos. Sponsor profiles, booth details and representative links do not appear. Speaker biographies and session links remain; the external **Official speaker information** link does not.
4. With an approved organizer account on a migrated live/test backend, edit a session and its speaker assignments, change lunch times/location, save, reload and confirm the public guide after refresh. Failed saves must remain visibly unconfirmed and retain the form values for retry.
5. In **Sponsor ads & placements**, select a sponsor and target page. Upload a JPG, PNG or WebP under 3 MB, add an image description, select square or banner, set display order and publication, inspect the preview and save. Banner images retain their original proportions, including vertical creatives. For agenda ads, select a day and optionally an after-session anchor. Other pages do not use agenda anchors. An uploaded image inside a form is not saved to that record until **Save changes**.
6. Load the guide online, open **More > Help > Open the offline guide**, then disconnect. Confirm the saved timestamp and cached agenda, sponsors, lunch, venue and announcements. Reconnect for changes. Private app/organizer responses must not be in Cache Storage. This is an offline public reader, not an offline organizer editor.

**Preview caveat:** the project's existing Preview environment is a labeled, read-only demo without a production database connection. It supports visual/navigation review and device bookmarks; it does not certify Sonia's account or persist manual organizer edits. The automated organizer tests use the real migrations/RLS in an isolated PostgreSQL-compatible test database, with synthetic records and fixture upload transport.

## Source qualification

- Lint, TypeScript and the production Next.js build pass.
- 184 unit/database tests pass. They include anonymous/member write refusal, draft creative privacy, cross-event/cross-day constraints, safe image URLs and event-isolated bookmarks.
- 45 public-site/organizer browser checks pass across desktop Chromium, phone Chromium and phone WebKit. They include actual database save/failure/retry/reload for sessions, speaker assignments, lunch and sponsor ads, image preview flows, public navigation, device bookmarks, retired routes, scoped accessibility and offline public data.
- The legacy community regression passes 125 checks, with three intentional project-specific skips. The focused legacy mobile WebKit suite passes all 28 checks. These run separately with `EVENT_BEAST_PUBLIC_SITE=false` and are retained for rollback/security coverage, not as the attendee experience being released.

The WebKit offline check stops an isolated origin after caching the actual shipped worker and reader. A fresh uncached browser is required to fail against that stopped origin. It does not use WebKit's broken offline-emulation flag, replace the service worker with a mock, or stop the application/production server. These checks do not certify a physical iPhone or venue Wi-Fi.

Commands:

```sh
npm run check
npm run test:e2e
npm run test:e2e:legacy -- --output test-results/legacy
npm run test:mobile:webkit
```

Screenshots and the public browser report are written under `test-results/public-site` and `test-results/public-site-results.json`. Desktop/mobile Home and the mobile creative editor were visually inspected. Generated test captures, raw email/shared-folder source pages and environment files are not application content.

## Current live handoff gaps: independently checked September 30 UTC

A read-only query of the dedicated Event Beast project `nyhzmazbfctuttizwnxp` found **33 published sessions, 44 published speakers, one published sponsor and zero published ad placements**. Therefore a successful source build does not mean the event's complete sponsor/creative content is loaded.

The existing `20260929154113_event_operator_session_save` migration is already present. Do not re-report that earlier migration as missing. The new sponsor-creative fields are not present yet; apply `20260930005305_public_event_sponsor_creatives.sql` only as part of the approved release to the dedicated Event Beast project. It preserves existing rows and event-scoped constraints while adding creative fields and optional non-agenda page placement.

The intended organizer email, **team@momentumbuilder.com**, has no registration in this event at the time of the read-only check. No account or role was created by this candidate. The owner must authorize and complete the existing audited organizer-access workflow, verify the intended email, and test a real save/reload and recovery flow before calling Sonia's handoff complete. Do not invent credentials, bypass email verification or write a role through user-editable auth metadata.

## Sponsor source and creative intake

`official-sponsor-reference.json` captures the official event website's sponsor-image occurrences, tier headings, source order and logo URLs. It is a review reference, **not a completed import or contract confirmation**. The raw DOM contains duplicate image occurrences; check the visual page and tier membership before importing. Multiple appearances of a company across different tiers must not be silently collapsed.

Sonia's shared **Attendee website ads** folder was opened and visually inspected. Its six visible assets are:

| Source file | Preparation required |
|---|---|
| Auto Apt Engine.png | Verify original dimensions and upload the approved image. |
| Braincode.pdf | Render the approved PDF page to a readable PNG/WebP, preserving all copy. |
| figure ad.png | Preserve the vertical creative's full proportions. |
| nftydoor ad.gif | Obtain/prepare an approved static frame for this static-ad workflow; do not blindly use an empty opening animation frame. |
| Total Expert ad.png | Verify original dimensions and upload the approved image. |
| xactus ad.png | Verify original dimensions and upload the approved image. |

The bulk shared-folder download timed out in this session. These assets have **not** been downloaded, converted, assigned to sponsor rows or published. Do not confuse synthetic browser-test images with the supplied creatives. The existing upload sanitizer intentionally accepts only JPG, PNG and WebP, not arbitrary PDFs, SVGs or animated GIFs.

## Release boundary

This branch does not merge or replace the production build, apply its new migration, change DNS, enable email delivery, send invitations or assign Sonia's access. The requested `live2026.momentumbuilder.com` cutover remains an owner-approved DNS task; unrelated domains and mail records are untouched.

After release approval: apply the new migration, deploy the reviewed commit, provision/verify the approved organizer, load the verified sponsor lineup and prepared creatives, then repeat the actual hosted editor/save/public-refresh checks. Record that live result separately. A demo preview and local test pass cannot satisfy those live handoff gates.

`EVENT_BEAST_PUBLIC_SITE=false` is an explicit legacy UI/API rollback switch. It does not delete new columns, discard private records, or automatically re-enable the separate directory/messaging database settings.
