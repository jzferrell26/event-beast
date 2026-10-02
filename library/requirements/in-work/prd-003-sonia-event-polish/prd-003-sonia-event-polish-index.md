# PRD-003 — Sonia’s event-review updates

Status: in work. Source: Sonia’s October 1, 2026 08:13:02 UTC email beginning “I AM LOVING THIS!!!”, its 08:15:11 UTC speaker-date follow-up, and the October 2 06:24:17 UTC rollout follow-up. Requested by Jonathan in this conversation. This is event polish, not the post-event SaaS build or permission to run load tests.

## Acceptance checklist

- Use the supplied red/silver M artwork for favicon, Apple home-screen icon and PWA icons. Preserve the full header logo. Original email attachment: `M icon.png`, SHA-256 `a18d3fd4ecb2c95bfcb6cacb758795de8fab9def85147a7bcc40ab9c657fe4aa`.
- Replace the attendee Sponsors trophy icon with a handshake.
- Make the sponsor page headline/introduction organizer-editable and title it **Impact Partners**. Show logos and accessible arrow links without redundant visible company names or “Visit website”.
- Add organizer-editable nonbold sponsorship captions. Source screenshot: Xactus and EA Appraisal — Kickoff Party; A1 AMC — Registration & Charging Stations; Lendware and Mack Financial Services — VIP Lunch; LoanBot+ and SHREDIT — Closing Party; Uplist and Rize — Breakfast; Model Match — Books; Halo — Inner Circle Dinner. Apply only to their Special Partners listings.
- Search all event days when an agenda query is entered; show dates in results and on each speaker’s session list. Clear search/day transitions must remain understandable.
- Remove attendee-facing agenda category pills. Do not erase existing category data or make organizers reclassify sessions.
- Support selected bold text in session descriptions with a simple toolbar and safe `**bold**` rendering, not raw HTML.
- Remove visible advertisement headers and use **Visit their website** on linked creatives. Fill missing destinations from already confirmed sponsor links; keep intentional specific destinations intact.
- Replace NFTYDoor’s former GIF-derived creative with the exact still PNG linked by Sonia. Preserve original aspect ratio and copy.
- Provide repeat-placement editing. Publish contracted extra placements only after sponsor/count evidence is identified; do not invent the meaning of “some sponsors twice.”
- Add the organizer-provided Hyatt floor-plan PDF link to Find your way, not as a broken image embed.
- Replace normal online offline-guide promotion with event Wi-Fi information. Retain safe cached-public fallback for a real disconnect, without promising current offline data.
- Display supplied event network `Hyatt-Meeting` and password `MBlive2026`; support text is exactly “Email us at team@momentumbuilder.com”, “Text us at 747-213-2155”, “Or come to the registration table”. Keep these details organizer-editable.
- Prepare separate approved Member access for Sonia’s requested `sle@lower.com`. Keep her organizer identity/role unchanged, require recipient verification, set no password on her behalf, and do not consume her link.

## Release boundaries

All content writes use narrow, event-scoped, concurrent-edit guards. Do not rerun the previous agenda import: Sonia has confirmed live edits. No real conversations/profiles are test data. Use synthetic accounts for authorization checks and clean up exact IDs.

The latest requested domain is **2026live.momentumbuilder.com**, superseding the differently ordered names in earlier documentation. Domain/callback/SMTP cutover and the Saturday registrant invitation are separate coordinated gates, not silently completed by this UI release. No bulk mail, provider change, paid provisioning or Pressure Monkey hosted run is included.

Qualify source/security, image provenance, actual browser search and editor behavior, phone layouts, existing private messaging/roles and public-only caching. Record pending items and deployed evidence separately; no automated test result certifies physical-phone installation or final sponsor contract fulfillment.
