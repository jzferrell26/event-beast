# Subscription qualification

Date: October 14, 2026. PR #35, stacked on PR #34.

## Evidence recorded so far

Local billing suites: **39 tests passed** across database migrations (14), provider/service contracts (15), and HTTP authentication/signatures (10). TypeScript passed after these additions. Full repository checks and real local Supabase integration are being completed; their final results are recorded below when available.

The database suite runs the actual schema migrations in PGlite. It checks the restricted role, verified buyer intent, one-account provisioning, event quotas, ownership, unpaid renewals, access expiry, agency overrides/suspension, cancellation/re-subscription, duplicate notifications, and expiry. It does not prove hosted database configuration or real provider payments.

The provider suite uses controlled Stripe objects to test stable checkout parameters, idempotency keys, paid-period evidence, concurrent processing order, old notification bodies, failed receipt retries, bounded recovery, and unsupported/mismatched prices or identities. The HTTP suite uses Stripe's real signature implementation for tampered, stale, mismatched-mode, and unsigned requests and verifies access before machine-capability use.

## Real-service qualification design

The isolated runner starts/reset local Supabase and applies all migrations. A generated login for `event_beast_billing` is used by the actual Postgres adapter. Three confirmed synthetic Auth users act as agency owner, purchaser, and unrelated customer. The actual Stripe SDK sends HTTP requests to a controlled loopback provider fixture. It does not use business Stripe credentials.

The service journey begins through authenticated Supabase RPCs, persists the checkout, then processes signed fixture notifications using two independent database connections. It verifies one resulting account, correct owner, no agency or attendee grants, rejection of direct customer-table access, a second customer's isolation, and concurrent enforcement of the paid event allowance.

Browser qualification signs into that actually provisioned local account to inspect subscription selection, agency offers, owner billing, mobile overflow, and denied cross-account billing. It does not click through real Stripe-hosted checkout or the customer portal. Provider response contracts and application HTTP signatures are tested separately as described above.

## Unperformed provider and production work

No hosted Stripe test checkout, payment-authentication challenge, hosted portal session, real card charge, real webhook delivery, production migration, owner assignment, live price creation, email delivery, or Momentum Builder adoption has been performed for this release. These require the business configuration and explicit rollout steps in [BILLING-IMPLEMENTATION.md](BILLING-IMPLEMENTATION.md).

Billing and platform activation remain disabled by default. Existing dependency installation reported eight high-severity advisories in the prior pinned dependency set; audit/remediation remains a production readiness item, not silently certified by these feature tests.
