# Subscription onboarding and automatic subaccounts

Date: October 14, 2026. PR #35 (`feat/subscription-provisioning`), stacked on the agency/customer release in PR #34.

## Customer behavior

A verified user opens `/platform/subscribe`, selects an available monthly or annual offer, and names an organizer workspace. The server reserves a durable checkout intent, then creates Stripe Checkout using the recorded price, purchaser, and retry key. Stripe's hosted page confirms the recurring amount before purchase.

Payment notifications reconcile the actual provider state and atomically create the subaccount with the purchaser as its owner. The buyer returns to a saved status page and can open the resulting workspace. Provisioning does not depend on keeping that browser tab open. It creates neither attendee registrations nor directory profiles. Existing event creation, content editing, and publishing use the new account's permissions.

The status page performs one reconciliation when opened and offers an explicit retry. Recent requests are available on the subscription page. Retrying a purchase with the same workspace details reuses its open intent. An expired checkout allows a new request. A lost response from Stripe is recovered from its saved session or a bounded search of the intent's creation window; the service does not risk another charge after the idempotency window. More than 500 matching-window sessions requires operator review, and is recorded as a recoverable failure.

A user may deliberately buy separate subscriptions for separate subaccounts. Renewals update the existing account. Restarting a canceled or incomplete-expired subscription from the owner's Billing page preserves that account, its events and its Stripe customer. An old subscription notification cannot replace the newer subscription. An active or past-due subscription must be recovered through its existing billing relationship instead of creating another charge.

## Agency and owner screens

`/agency/billing` is available only to the explicit platform owner. It accepts an existing Stripe price ID, fetches the actual amount/currency/interval from Stripe, and registers the offer with its event allowance. Offers are immutable; closing one prevents new purchases without changing existing terms. New terms require a new Stripe price. This screen lists subscription status and failed notification diagnostics without displaying payment bodies or credentials.

`/app/[organizationSlug]/billing` requires current owner membership or agency access. It shows the confirmed paid period, plan and allowance, opens an explicitly configured Stripe billing portal, and refreshes the current subscription. The portal supports payment details, invoices and cancellation; self-service plan changes must be disabled in its configuration for this release. Account owners retain billing recovery access after a paid period expires or the agency suspends event operations.

The subscription catalog contains no hardcoded commercial prices. Qualification fixtures have explicitly synthetic prices and identities. Choose real packaging in the agency console after test configuration is verified.

## Payment and access rules

Only one fixed licensed subscription item with quantity one is supported. Plans must recur monthly or annually, once per interval. Metered usage, multi-item bundles, trials, arbitrary discounts, prorated self-service upgrades, Connect accounts and attendee-count charging are outside this release.

Initial activation requires an eligible subscription and a confirmed paid invoice period for the same subscription item, price and customer. An open or failed invoice does not extend access. `invoice.paid` can include valid settlement through customer credit or a zero invoice; the receipt must still be tied to the purchased subscription period. A browser return URL does not establish payment.

A renewal failure preserves the last confirmed paid-until value. After that instant, organization event-management permission is denied; an owner can still access Billing to recover payment. An agency suspension remains independent: paying cannot clear it. Cancellation does not delete records or unpublish existing guides. No extra grace interval or automatic data-deletion policy is invented here; those commercial policies must be set before accepting customers under published terms.

The effective event allowance is an explicit agency `event_limit`, when present, otherwise the subscription's `billing_event_limit`. The database checks the allowance while holding the organization lock so concurrent event creation cannot exceed it. Existing events are retained if an allowance decreases; all stored events currently count toward the limit.

## Database and authorization

The migration `supabase/migrations/20261014200756_subscription_billing.sql` adds a public plan catalog and a private `billing` schema. Checkout intents, subscription accounts, and receipt state are not exposed through the Data API. Authenticated user operations use small invoker RPC wrappers with explicit grants and verified-identity checks. Ordinary application requests continue to use the existing user-scoped Supabase client.

The `event_beast_billing` database role is created **without login**. Its only useful permissions are execution of the specific functions that read billing intents, bind provider identifiers, serialize subscription reconciliation, apply paid account changes, and track notification attempts. It has no direct table access, attendee-data access, or agency-grant operation. The application's billing pool rejects a different connection user and verifies `current_user` after connecting. Remote connections verify TLS certificates; URL parameters cannot override that policy.

Subscription processing locks by subscription ID before fetching current Stripe state. Receipt identity is persisted before processing; a failure is retained for diagnostics and the HTTP endpoint returns a retryable response. Success and account provisioning commit together. The event payload is never saved in the receipt table. Duplicate notifications are harmless; delayed notifications trigger current-state retrieval rather than applying their old body.

Production runtime contains no broad service-role client. The isolated qualification script uses privileged local credentials solely to create fixtures and enable a random local billing-role password. It rejects hosted targets and does not pass its administrator credential to the application.

## Configuration and activation

Follow the agency activation steps in [PLATFORM-IMPLEMENTATION.md](PLATFORM-IMPLEMENTATION.md) first, using the dedicated Event Beast infrastructure. Leave production feature flags closed while reviewing and rehearsing the migrations in isolated infrastructure.

1. Apply the reviewed migrations in the isolated target. Inspect grants, RLS and advisor findings. Create the machine login credential through an authorized database administrator outside source control; supply a connection restricted to `event_beast_billing` as `EVENT_BEAST_BILLING_DATABASE_URL`. Supply a trusted PEM CA only when required by the provider's certificate chain.
2. Set the trusted workspace origin in `EVENT_BEAST_PLATFORM_URL` and align Auth redirects. Qualify signup, email verification and recovery before enabling new-customer enrollment. Existing email-readiness flags remain authoritative; local confirmed test users do not certify mailbox delivery.
3. Start with `EVENT_BEAST_BILLING_MODE=test`, a matching `EVENT_BEAST_STRIPE_SECRET_KEY`, and `EVENT_BEAST_BILLING_ENABLED=true` in the isolated deployment. The platform flag must also be enabled and demo mode disabled. No key is prefixed `NEXT_PUBLIC_`.
4. Configure a **snapshot-event** Stripe endpoint at `/api/billing/webhook`, using the API version pinned by `stripe@23.0.0`: `2026-09-30.endive`. Put its signing secret in `EVENT_BEAST_STRIPE_WEBHOOK_SECRET`. Subscribe to checkout completion/asynchronous success/expiry, subscription created/updated/deleted/paused/resumed, and invoice paid/payment-failed/payment-action-required events. See the exact `billingEventTypes` set in source.
5. Configure an active Stripe customer portal for payment methods, invoices and cancellation, with subscription updates disabled. Set its ID in `EVENT_BEAST_STRIPE_PORTAL_CONFIGURATION`. The server validates the mode and restrictions before creating a portal session.
6. Register an actual Stripe test price through the agency Billing screen. Complete a real Stripe test checkout, exercise required payment authentication and a renewal failure, inspect the signed webhook delivery, then open the owner's portal. Confirm automatic account creation and correct event allowance. These provider-hosted checks require the business's Stripe configuration and are distinct from the controlled provider fixture used in CI.
7. Resolve commercial prices, allowed currencies/methods, taxes and customer terms. After the hosted checks pass, use separate matching live credentials, endpoint secret, portal configuration and live-mode offers. Changing one flag does not convert test records into paid live accounts. Production changes remain an explicit rollout step.

Do not put a postgres/admin password into the billing environment variable, deploy preview billing against production data, or use customer-supplied provider IDs as authority. Existing manually created accounts remain usable without billing records. Billing flags hide entry points but database access enforcement for already-subscribed accounts remains authoritative.

## Testing and recovery

`npm run check` runs the repository lint, TypeScript, database/domain tests and production build. Billing suites cover paid eligibility, stable identity, raw signatures, replay, quotas, cross-account access, revocation, retained history and recovery. The local integration suite additionally connects as the restricted role to actual Supabase Postgres and uses the real Stripe SDK against an explicit loopback HTTP fixture.

After `supabase start` and a clean local reset, `node scripts/qualify-billing-local.mjs` runs the real-service integration and browser views. It only accepts the repository's loopback ports (`54361` API, `54362` Postgres). It creates synthetic confirmed users, never real customer records or payments. The script requires a fresh database; use isolated runner infrastructure rather than resetting an existing developer dataset.

Failed receipts appear in agency diagnostics. Correct credentials, recognized-price configuration or provider availability, then retry delivery in Stripe. The buyer can also use Check payment status or Refresh subscription status. Stored sessions remain recoverable if an HTTP response was lost. A failed event is never acknowledged as processed merely because its HTTP request arrived.

[Billing qualification](BILLING-QUALIFICATION.md) distinguishes passed local/CI evidence from unperformed real-provider and production checks.

## Current documentation references

Checked October 14, 2026: [Stripe webhooks](https://docs.stripe.com/webhooks), [subscription events](https://docs.stripe.com/billing/subscriptions/webhooks), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [currency minor units](https://docs.stripe.com/currencies), [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles), and [node-postgres TLS](https://node-postgres.com/features/ssl).
