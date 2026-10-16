# Event Beast qualification record

This document distinguishes implemented behavior from verified operation.
Source tests do not establish production activation.

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
