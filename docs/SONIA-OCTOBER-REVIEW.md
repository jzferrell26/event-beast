# Sonia’s October review — implementation and handoff

Source: October 1 “I AM LOVING THIS!!!” email at 08:13:02 UTC and the 08:15:11 UTC speaker-date follow-up. Sonia confirms her real Admin edits saved and appeared publicly. These updates preserve those edits; the old agenda import must not be rerun.

## Organizer controls

In **Welcome & app settings**, edit **Impact Partners page headline**, **Impact Partners introduction**, **Event Wi-Fi network**, **Event Wi-Fi password**, **Event support text number**, and **Venue floor-plan PDF link**. These are expressly public attendee details, not account passwords. Existing clients may omit the new fields without overwriting them.

In **Sponsors**, edit **What this partner sponsored**. It appears in regular-weight text beneath the logo and above the arrow. Company names remain available to assistive technology and as a missing-logo fallback, but redundant visible names and “Visit website” labels are removed from normal logo cards. The Sponsors navigation uses a handshake; the main heading is Impact Partners. No logo order, tier membership or sponsor-edit assignment is changed.

In **Agenda sessions**, select words in **Session description** and press **Bold**, or type `**bold words**`. The preview and attendee description render bold text without interpreting HTML. Raw HTML is displayed as text, not executed. Existing descriptions remain valid. The session type is retained internally; attendees no longer see category pills in the public event experience.

An agenda search spans every published event day, includes speaker names and shows dates with results. Selecting a day clears the search. Speaker profile session cards also show dates.

In **Sponsor ads & placements**, **Copy placement** opens a new **unpublished** draft with the original creative, sponsor and destination. Choose the destination page/order, review and save. This does not silently duplicate all sponsors: the email does not identify which contracts require two placements. Exact sponsor/count approval remains required before publishing additional slots.

All linked creative captions say **Visit their website**. A placement-specific HTTPS destination takes precedence; otherwise the confirmed sponsor website is used. No visible Advertisement heading is displayed. The actual ad image and the entire NFTYDoor still creative retain their aspect ratio and are not cropped.

## Assets and public information

The compact red/silver M is the original `M icon.png` attachment, SHA-256 `a18d3fd4ecb2c95bfcb6cacb758795de8fab9def85147a7bcc40ab9c657fe4aa`. Browser, Apple and PWA metadata use new cache-distinct paths. The full header logo is unchanged. Previously installed home-screen shortcuts may retain an old cached icon and need to be removed/re-added; browser tests do not claim physical installation acceptance.

NFTYDoor’s replacement is the organizer-provided `Nfty-Door-ad_still-image.png` (700 × 1500). `scripts/sync-october-organizer-polish.mjs` validates the PNG, prepares a lossless WebP, verifies stored bytes, and changes only the named creative and blank destinations. It also sets the screenshot-backed captions for the Special Partners listings and the supplied Wi-Fi/support/map fields. It defaults to a dry run and guards against concurrent edits. The committed content report is separate from this implementation note.

The Find your way page links to Sonia’s exact Hyatt floor-plan PDF URL. Help and Venue show the event Wi-Fi plus the supplied email, SMS number and registration-table contact instructions. Online offline-guide promotion is removed; the existing cached-public-only fallback remains available when navigation actually loses the network. No private pages, messages, auth data or profile images are added to that cache.

## Account handoff

Sonia requested `sle@lower.com` as a separate **Member**. An approved event registration and unverified invitation were prepared for that exact address, with the existing `team@momentumbuilder.com` Admin account unchanged. The private link was sent from Jonathan’s Outlook and a Sent Items copy was found. No real-person token was consumed or password chosen by the agent. Recipient activation remains Sonia’s step. Invitation credentials stay out of Git and public reports.

## Remaining coordination

The October 2 follow-up asks for **2026live.momentumbuilder.com**, superseding differently ordered domain names in earlier notes. Domain/DNS/auth callbacks, automatic account-mail delivery, the real roster and the Saturday invitation wave remain separately verified rollout gates. This patch does not change DNS, enable bulk account mail, schedule an invitation blast, run hosted load tests or add paid infrastructure.

Need the exact sponsors/counts for repeat ad placement. Missing Mack Financial/Halo website destinations remain unresolved rather than borrowing another company’s link. Fun Stuff content remains a separate organizer input.

## Qualification

PR #18 is merged and production aliases resolve to merge commit `c468b6fa5fa21d61a3b60499f16d7ec2eec85e88`. The hosted Sonia-specific verification passes five checks against that exact revision: source-backed public settings/partner captions/six linked ads, exact favicon/home-screen icon bytes, Chromium phone UI, WebKit phone UI, and real Admin-vs-Member authorization for unpublished organizer edits. Synthetic users/records were removed. See `sonia-october-live-qualification.json` and `october-organizer-content-sync.json`.

The broader source/CI regressions also passed before merge. A physical iPhone re-add-to-home-screen and final organizer review are not replaced by browser emulation. Automatic account-email delivery, the final attendee roster/invitation wave, `2026live.momentumbuilder.com`, exact repeat-ad contracts, Fun Stuff content, and missing Mack Financial/Halo website destinations remain separate coordination items.
