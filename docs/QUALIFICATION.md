# Event Beast qualification record

This document distinguishes implemented behavior from verified operation.
Source tests do not establish production activation.

## October 14 — agency and customer workspaces

PR #34 implements the first manual customer journey: agency subaccount creation,
verified owner acceptance, event editing, authorized preview and public publishing.
See [Platform qualification](PLATFORM-QUALIFICATION.md) for commit-specific checks,
run links, browser evidence and any unresolved failures. The implementation and
activation handoff is [PLATFORM-IMPLEMENTATION.md](PLATFORM-IMPLEMENTATION.md).

The test environment is disposable local Supabase in GitHub Actions; it does not
use the production project. The agency owner is a synthetic fixture identity in
those checks. No production migration, real platform-owner assignment, event
adoption, SMTP delivery, paid subscription, DNS change or production activation
has been performed by this source work. The platform feature flag remains off by
default. Existing event history and community behavior remain separate from
customer workspace qualification.

The desktop tunnel returned `tunnel_client_not_seen`, so implementation continued
through the canonical GitHub branch and an isolated source checkout. Local changes
on Jonathan's disconnected computer were not inspected or modified.

## Momentum Builder qualification history

The complete, unchanged September 22–October 3 record is preserved in
[Momentum Builder qualification history](QUALIFICATION-MOMENTUM-BUILDER.md).
Its release revisions, test counts, production actions and outstanding gates are
historical evidence for those releases, not sign-off for this platform migration.

## Required release evidence

For code changes, run the repository's lint, TypeScript, database/domain tests,
production build and applicable browser suites. Run the platform integration
workflow against disposable local services to qualify real Auth, HTTP and RLS.
Inspect the generated screenshots and record exact source revisions and run IDs.

Before production activation, separately verify migration compatibility,
Jonathan's explicit platform-owner identity, the customer handoff, sender/inbox
and recovery flows, intended domains, and Momentum Builder ownership/adoption.
Actual hosted capacity and physical-device/network qualification remain distinct
from local integration tests. Do not infer that a source check has closed them.
