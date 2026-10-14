# Agency and customer workspace qualification

Date: October 14, 2026. PR #34, `feat/agency-subaccounts`.

## Tested implementation

Application source: `b6ee141ceb2d506cb5cbe621c4af2be2bcd0b05c`.
The subsequent handoff commit changes documentation, example environment settings
and code comments only. It does not change the tested application behavior.

This qualifies the first manual account-to-published-event workflow. It does not
qualify paid subscription provisioning or activate the production platform.

## Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Lint, TypeScript, unit/database tests, production build | [Quality run 38608174965](https://github.com/jzferrell26/event-beast/actions/runs/38608174965) | Passed at the tested source revision. |
| Existing public event browser suite | Same quality run, `npm run test:e2e` | Passed. |
| Legacy event browser suite | Same quality run, `npm run test:e2e:legacy -- --output test-results/legacy` | Passed. |
| Mobile WebKit browser suite | Same quality run, `npm run test:mobile:webkit` | Passed. |
| Migration rehearsal and error-level security advisors | [Platform run 38608174996](https://github.com/jzferrell26/event-beast/actions/runs/38608174996), job `116004361008` | Passed on disposable local Supabase. |
| Actual customer browser journey | Same platform run, `tests/platform-browser/customer-journey.spec.ts` | One comprehensive test passed; zero skipped, unexpected, or flaky results. |
| Visual inspection | Platform artifact `11917146949` | Agency desktop, customer mobile and public-event mobile screenshots reviewed. |

The platform browser report started at `2026-10-14T17:39:56.996Z`. The workflow
built the app and used confirmed synthetic accounts with real local Supabase
Auth, HTTP endpoints and database writes. Application persistence was not
mocked. Privileged fixture credentials were not passed to the app server.

The local Supabase services were created inside the GitHub runner, reset through
all migrations, and removed after the test. The security-advisor command checked
error-level findings; this is not a claim that all warning-level findings or all
possible security issues have been eliminated.

## Customer journey exercised

The agency fixture signs in at `/agency`, creates an Alpha subaccount through
the UI, creates a second Beta subaccount, and retries that second creation to
verify it returns the same account. Alpha's verified owner accepts the pending
invitation, creates a private event, and saves its details and dates.

The owner adds an event day, speaker, sponsor, and a session with an assigned
speaker, then reloads to verify persistence. An anonymous visitor cannot see the
unpublished event. The owner opens an authorized preview, publishes, and the
anonymous browser sees the correct event content at its own URL.

Beta's owner is refused agency access, another customer's event reads/writes,
and an event ID paired with the wrong organization. Beta can publish its own
event. Switching the same public browser between the two event URLs preserves
the correct names and agenda content.

The test also verifies stale publication versions are rejected, private API
responses use `no-store`, and forged origins cannot publish. Agency suspension
blocks Alpha's management access while preserving agency recovery access.
Reactivation, unpublishing, sign-out and subsequent unauthorized requests pass.

The customer and public-guide pages were checked at a 390-pixel mobile viewport
for horizontal body overflow. Screenshots use explicitly synthetic account and
event content; they are not captures from a live customer workspace.

## Permission coverage

The database suites execute the actual migrations and simulate hosted default
function grants. Coverage includes the explicit singleton agency identity,
organization/event boundaries, direct Data API writes, private drafts, owner
and invitation rules, replay after revocation, stale versions, event limits,
legacy event adoption and audit visibility.

Team account emails are returned only to an authorized organization owner or
platform owner. Other customers, nonowner staff, anonymous and unverified users
are rejected. No email field is added to attendee directory profiles.

A rejected direct event write is checked both for the PostgreSQL authorization
error and for unchanged persisted fields. Customer staff do not automatically
receive attendee registrations or community participation. Existing event IDs
and registration counts survive the isolated adoption test.

## Operational limits and unperformed work

No production migration, owner assignment, Momentum Builder adoption, domain
change, email delivery, payment processing or production feature activation was
performed. The feature flag defaults to false. Jonathan's actual verified Auth
identity and the intended Momentum Builder organization owner must be confirmed
before activation/adoption, as specified in the
[implementation handoff](PLATFORM-IMPLEMENTATION.md).

The successful browser login uses confirmed local fixtures; it does not verify
SMTP delivery, real invitation email, or mailbox recovery. Workspace invitations
are stored for acceptance and do not send email in this release.

Paid checkout, subscription-created accounts, commercial entitlements, new
customer community modules, custom-domain automation, customer offline guides,
cloning, and staged revisions remain later milestones. These are not represented
as completed by the first manual workflow test.

Hosted capacity, physical phones and venue networks were not tested. Dependency
installation reported eight high-severity advisories in the existing pinned
dependency set; a dependency audit/remediation was not completed in this change.

The disconnected desktop tunnel prevented inspection of Jonathan's local
uncommitted work. The canonical GitHub branch and isolated checkout were used.
The complete prior event qualification record is preserved byte-for-byte in
[Momentum Builder history](QUALIFICATION-MOMENTUM-BUILDER.md), Git blob
`e1cf22fbfba0c42b23784ecf7cdc4a19afec9c4b`.
