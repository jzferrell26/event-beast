# Website activation — September 23, 2026

## Delivered implementation

Event Beast launches as a website. Safari, Chrome and other normal browsers can use the event guide without an App Store download. Home-screen installation remains optional.

The approved Cuantico Supabase project is `nyhzmazbfctuttizwnxp`; the dedicated Vercel project is `cuantico-ai/event-beast`. All ten versioned migrations are applied to that database. The public event is `a9bdf080-f47f-538e-94f7-38e4ff996116`, with the canonical slug `momentum-builder-live-2026`.

The working program imports 42 schedule records across October 6–8. Thirty-three are published as a working agenda; nine ambiguous/incomplete source rows remain unpublished with Admin-only review notes. Run-of-show contact details, AV/travel instructions and backstage sales notes are excluded from attendee pages. The source sheet is linked in `data/momentum-builder-working-schedule.json` and the import manifest is `docs/program-import.json`.

Thirty-eight headshots and concise speaker introductions are sourced from the official event website, with source links and image hashes retained. Eric Post, Garin Heslop and Jay Jones do not have matching official website headshots/bios in the imported source and retain honest missing-content fallbacks. The speaker directory links biographies to scheduled sessions.

## Event-day member flow

1. An attendee opens `/join` from the event link or QR code.
2. They enter the email used for event registration and choose a password.
3. They verify once using the eight-digit email code or secure link.
4. An approved roster record is claimed by that verified email. They complete their profile, choose directory visibility and messaging availability, then use the website.
5. A person missing from the roster can request access. That request is a pending Member record until an Admin approves it; it never grants automatic attendee or sponsor privileges.

Normal browser sessions persist after closing/reopening with automatic token renewal. Cookies are configured for up to 365 days; sign-out, cookie deletion, private browsing, password/session changes and revoked event access can still require authentication. Verification/recovery redirects use the configured website origin, preserving the cookies behind a reverse proxy.

## Contact boundary

Emails, phone numbers and personal contact links are not directory profile fields. The dedicated `attendee_contacts` table and registration contact details are Admin-only. Sponsor/member responses use explicit profile projections, and direct database joins cannot reveal the private contact rows. Admins maintain this information in a separate contact editor. The platform does not offer an attendee email/phone export to sponsors or members.

Members and sponsors can use private chat when enabled. This does not attempt to prevent a person voluntarily typing contact details into a private message or biography.

## Measured qualification

Local checks passed: TypeScript, ESLint, 86 database/domain tests, production build, and 57 browser checks with three intentional project-specific skips. The browser suite includes website signup screens, absent profile contact fields, speaker navigation, Admin contact tools and the existing accessibility, offline, sponsor-role and messaging coverage.

Eleven additional checks used the real dedicated Supabase Auth, Postgres, Storage and private Realtime services through the production Next.js build running locally. They verified password sign-in, verified roster matching, retained cookies after browser-context reopen, actual private WebSocket delivery, durable reload, identical-send retry, reconnect, blocking, image upload confirmation, Sponsor scope, Admin-only contacts, recovery-token password reset, refresh-token renewal and disabled membership. Exact results are in `docs/hosted-website-qualification.json`. They used synthetic identities, not real attendee inboxes or physical phones.

The one-IP burst test started 500 requests together in each phase:

| Measured phase | Completed | Total elapsed | 95th percentile | Explicit throttles retried |
| --- | ---: | ---: | ---: | ---: |
| Email-token verification | 500/500 | 31.08 seconds | 28.78 seconds | 1,077 |
| Password sign-in | 500/500 | 31.02 seconds | 29.37 seconds | 998 |
| Approved registration claim | 500/500 | 11.69 seconds | Not measured | None |

**This is not proof of 500 successful public signups or email deliveries.** Synthetic signup verification links were generated in advance through the administrative API; real mailbox delivery was bypassed. The public-signup smoke hit the built-in two-email/hour provider limit. Report: `docs/hosted-auth-burst.json`.

## Remaining launch inputs

- Configure an approved transactional SMTP provider and From address. Increase both provider capacity and Supabase's email quota for 500 initial verification emails plus resend/recovery headroom, then measure actual public signup and delivery to independent inboxes. Keep `EVENT_BEAST_EMAIL_READY=false` until this is verified.
- Import the real attendee roster and confirm Admin/Sponsor assignments. The initial Admin registration is prepared, but no real attendee accounts or mass invitations were created by the import.
- Resolve the nine held schedule rows, final speaker details, sponsor assets/placements, lunch/dietary information and venue maps with the organizer.
- Test on actual event phones and the venue network. The local browser/one-IP benchmark does not measure physical Wi-Fi coverage or end-to-end email-provider latency.

The synthetic test hook was disabled and all 500 synthetic Auth accounts and their scoped test event were removed after qualification; no real attendee registrations were deleted. For a future run, `scripts/qualify-hosted-auth.mjs prepare-restore` prepares the hook-removal config; inspect/push that config, then run its scoped `cleanup` action. These scripts validate the dedicated project and synthetic event before deleting anything. Runtime application processes never receive the testing service key.

## References

- Official speaker and event source: https://www.momentumbuilderevent.com/
- Supabase Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Production SMTP and surge preparation: https://supabase.com/docs/guides/auth/auth-smtp
- Session behavior: https://supabase.com/docs/guides/auth/sessions
