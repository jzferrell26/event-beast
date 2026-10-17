# Event Beast qualification record

This document distinguishes implemented behavior from verified operation.
Source tests do not establish production activation.

## October 17 — guided event setup and launch review

[PR #36](https://github.com/jzferrell26/event-beast/pull/36) is merged. Opening
an event now starts with eight saved-content checks, direct editor actions and
a launch review that distinguishes published guide content from drafts. Dates
remain the required publishing input; optional sections do not block publication.
See [Guided event setup](GUIDED-EVENT-SETUP.md) for the implementation and its
read-only count semantics.

Tested head: `951522cf510db4e21b2a54abe254e1f69e515b21`. All three workflows
completed successfully before release:

| Check | Evidence | Result |
| --- | --- | --- |
| Application quality | [Run 39035905321](https://github.com/jzferrell26/event-beast/actions/runs/39035905321) | Lint, TypeScript, unit/database tests, production build, public browser suite, legacy browser suite and mobile WebKit passed. |
| Platform integration | [Run 39035905359](https://github.com/jzferrell26/event-beast/actions/runs/39035905359) | Migration/advisor checks and all three real local Supabase browser scenarios passed; zero skipped, failed or flaky results. |
| Billing integration | [Run 39035905385](https://github.com/jzferrell26/event-beast/actions/runs/39035905385) | Existing isolated subscription provisioning and billing browser checks passed. |

The platform journey exercises an undated draft, disabled publishing, saved
dates, content creation, a published session hidden by its draft parent day,
accurate progress after reload, correction of the hidden-day issue, public
publishing, and anonymous/second-customer denial. The existing hostname and
email-link checks passed as well. The first browser attempt stopped on an
ambiguous substring selector; the tested head selects the exact Review & publish
action. Platform artifact `12102246709` contains the final report and screenshots.
The setup guide was visually reviewed on desktop and at a 390-pixel mobile
viewport, including the draft-content warnings and overflow check. Those images
use synthetic test accounts and content.

Production merge: `609b23bedb0df61ec082aa9a2eda50eca67363fe`. Its tree equals
the tested head tree, `4c54fb5ec72c0c31bddd4b36390201eda5a582cc`.
Vercel deployment `dpl_2caTQPtS6m3wMrKSHurP4Qb9DgDv` was verified READY in
the existing production Event Beast project under Cuantico AI.

At October 17, 2026, 13:33:05 UTC, direct HTTPS checks on BOTH
`eventapp.momentumbuilder.com` and `2026live.momentumbuilder.com` confirmed:

- Root HTTP 200 with Momentum Builder branding and no redirect.
- Release endpoint HTTP 200 with the exact production merge revision.
- Public guide HTTP 200 with original event ID
  `a9bdf080-f47f-538e-94f7-38e4ff996116`, 49 sessions, 44 speakers and 37 sponsors.
- Workspace sign-in and the organization/event public guide both HTTP 200.
- The new event setup endpoint rejects anonymous access with HTTP 401 and
  private/no-store headers, without returning checklist data.

Filtered HTTP evidence and the read-only verification script are retained in the
local ignored `test-results/` directory. No production event records, schema,
permissions, DNS, environment variables, email settings or billing activation
were changed by this feature. Actual production password-based owner login was
not performed by the agent. Hosted email delivery, Stripe-hosted payment flows,
capacity and the previously recorded security/dependency advisories remain
separate qualification work. Jonathan deferred the custom agency DNS record;
this release does not assert that the new custom hostname resolves.

## October 16 — production agency and Momentum Builder

PRs #34 and #35 are merged. The production deployment at
`f6424aec89978a7e6c2c4a3c9bb551ed1cfd652a` includes the agency hostname route and
retains the original Momentum Builder event routes. Both reviewed migrations,
Jonathan's production agency-owner assignment and the real Momentum Builder
subaccount/event attachment are committed. Full-row checks on 34 existing event
tables found no changes. Both existing event domains passed deployed HTTP checks.

The external GoDaddy CNAME for `eventbeast.jonathanferrell.com` is still required.
See [Production agency rollout](PRODUCTION-AGENCY-ROLLOUT.md) for exact targets,
test runs, DNS instructions, preservation checks, access verification and remaining
email/payment/security qualification. This supersedes older preview-only status.

## October 16 — isolated hosted platform preview

The subscription branch was deployed on Vercel with its own healthy Supabase
preview branch and both new platform migrations. Sign-in rendering and release
provenance were checked. The preview remains isolated from production event data.
See [Hosted preview checkpoint](HOSTED-PREVIEW.md) and
[Owner activation](AGENCY-OWNER-ACTIVATION.md) for its historical setup evidence.

## October 14 — agency and customer workspaces

PR #34 implements the first manual customer journey: agency subaccount creation,
verified owner acceptance, event editing, authorized preview and public publishing.
See [Platform qualification](PLATFORM-QUALIFICATION.md) for commit-specific checks,
run links, browser evidence and any unresolved failures. The implementation and
activation handoff is [PLATFORM-IMPLEMENTATION.md](PLATFORM-IMPLEMENTATION.md).

At that October 14 checkpoint, testing used disposable local Supabase in GitHub
Actions with synthetic agency identities. No production activation had occurred.
The later production section above records the actual rollout separately.

## Momentum Builder qualification history

The complete, unchanged September 22–October 3 record is preserved in
[Momentum Builder qualification history](QUALIFICATION-MOMENTUM-BUILDER.md).
Its release revisions, test counts, production actions and outstanding gates are
historical evidence for those releases, not sign-off for later changes.

## Required release evidence

For code changes, run the repository's lint, TypeScript, database/domain tests,
production build and applicable browser suites. Run the platform integration
workflow against disposable local services to qualify real Auth, HTTP and RLS.
Inspect generated evidence and record exact source revisions and run IDs.

Record database changes, explicit platform-owner identities, customer handoff,
sender/inbox and recovery flows, domains and event adoption separately. Hosted
capacity, actual password-based browser sessions and physical-device/network
qualification remain distinct from isolated integration or direct HTTP checks.
