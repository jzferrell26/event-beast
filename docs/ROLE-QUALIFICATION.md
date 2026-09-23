# Admin, Sponsor and Member release qualification

## Implemented

The three-role model requested by Jonathan is implemented in the application and versioned database migration `202609230008_event_roles.sql`. See `docs/ROLES.md` for the permission matrix and activation workflow.

Admins can add and manage event users, approve or disable access, choose Admin/Sponsor/Member and assign specific sponsor pages. Sponsors have their own workspace and page editor with content preview and scoped logo uploads. Members keep the attendee experience and their own profile controls. Pre-publication verified claims support sponsor setup before public event launch.

## Verified locally

- TypeScript check: passed.
- ESLint: passed.
- Database and domain tests: **70 passed across 7 files**, including 16 role/assignment/activation tests.
- Next.js production build: passed.
- Browser suite: **49 passed, 3 intentional project-specific skips, 0 failed**, across desktop/mobile Chromium.
- Accessibility: **0 axe violations in the tested WCAG A/AA matrix**, now 11 routes in each of desktop and mobile, including Users & roles, Sponsor workspace and Sponsor editor.

Permission tests cover Admin user management, Member write denial, Sponsor page assignment, cross-event and cross-sponsor denial, forged administrative fields, direct table updates, scoped storage uploads, stale version conflicts, role revocation, disabled accounts, last-admin protection, private profile defaults, verified pre-publication claim and bootstrap Admin attendee enrollment.

Browser tests exercise the real Sponsor editor and role-assignment forms against the demo API; the separate database suite executes actual PostgreSQL policies/RPCs. These tests do not claim to validate hosted Supabase Auth, email delivery, Storage transport or Realtime transport.

## Visual artifact

`scripts/create-visual-review.mjs` captures actual application screens from an explicit demo deployment and refuses to capture a live event. It creates an interactive nine-screen HTML review, a visual PDF and an overview image under `public/review`. Only the labeled sample program, sample accounts and sample sponsor content are included. No font files or live attendee records are included in the review artifact.

## Still required for real users

Connect the dedicated Event Beast Supabase project, apply all migrations, bootstrap the verified initial Admin, configure the approved email sender/callbacks, load confirmed event/sponsor content and import the approved attendee roster. Qualify real Admin/Sponsor/Member logins, cross-sponsor denial, uploads, email recovery, messaging/reconnect and physical-device/shared-network behavior before switching the public deployment out of demo mode.
