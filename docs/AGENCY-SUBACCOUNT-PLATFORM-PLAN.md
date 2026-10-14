# Event Beast: agency and subaccount platform plan

Date: October 14, 2026  
Status: Proposed implementation plan; platform features below are not shipped.  
Source reviewed: `main` at `9b4cb9adddf7055f581adf1a88342f5086f623cc`.

## Product direction

Jonathan confirmed that Momentum Builder has concluded and requested the next Event Beast system: a private agency backend available solely to him, subscription-created customer subaccounts, and customer access to manage their own event details. This activates the commercialization work previously deferred in [the post-event roadmap](POST-MOMENTUM-BUILDER-PRODUCT.md).

The recommended structure is **Event Beast agency -> customer subaccount -> events**. A subaccount represents the organizer or business. Momentum Builder becomes a subaccount containing its existing 2026 event; it can add future editions under the same customer relationship. Additional editions in this document are examples, not confirmed bookings.

Every distinct new-account subscription purchase provisions one subaccount. Renewals, upgrades, webhook retries, and subscription replacement for an existing account retain that account. A person may own multiple subaccounts through separate, deliberate purchases.

This document specifies the proposed product and build sequence. Exact prices, billing cadence, plan limits, and customer contract terms remain commercial decisions. They do not prevent work on account ownership and event management.

## What the repository already provides

The reviewed source includes a public guide, attendee accounts and community, durable private messages, sponsor tools, and organizer content editing. The [README](../README.md) explicitly identifies SaaS tenancy, self-service event creation, and billing as roadmap work. The [operator guide](OPERATOR-CONSOLE.md) describes existing agenda, speaker, image, sponsor, and user-management workflows we can reuse.

The important refactoring points are concrete:

| Existing area | Current behavior observed | Required evolution |
| --- | --- | --- |
| [`src/lib/server/guide.ts`](../src/lib/server/guide.ts) | `eventSlug()` reads deployment-wide configuration and defaults to Momentum Builder. The underlying guide loader already accepts a slug. | Resolve the requested organization/event explicitly. Give public cache invalidation an event-specific scope. |
| [`src/lib/server/auth.ts`](../src/lib/server/auth.ts) | `getActor()` authenticates against the globally selected event and may claim an attendee record. `requireAdmin()` derives from that actor. | Separate identity, platform access, organization membership, and event access. Customer staff must be able to manage an event without becoming attendees. Preserve the existing attendee-claim behavior in attendee flows. |
| [`src/app/layout.tsx`](../src/app/layout.tsx) | Metadata, canonical origin, titles, icons, and manifest references identify Momentum Builder. | Provide a neutral application shell and event-specific branding/metadata. |
| Event-owned data and permissions | Repository guidance requires event-scoped records, composite relationships, RLS, sponsor assignments, and last-admin protection. | Add organization ownership above events while retaining event boundaries and the existing role protections. |
| Organizer experience | Existing content tools operate within the single-event deployment. | Embed them in a customer workspace with event selection, setup, settings, and publishing. |

This is a source review, not a complete schema audit or live-production qualification. Before implementation, inspect the applicable migrations, all callers of the affected helpers, the route tree, and the service worker in the active checkout. The local Chat On Steroids connection was unavailable during planning, so local uncommitted work was not inspected.

## The three experiences

### 1. Agency console: Jonathan only

Proposed entry point: `/agency`.

The agency console provides a subaccount list with owner, account status, plan, event count, and setup progress. Jonathan can create an account manually, assign its verified owner, open its workspace for support, inspect provisioning failures, manage recorded plan exceptions, and suspend or reactivate account operations.

The dashboard should prioritize actionable information: accounts needing setup, upcoming published events, failed provisioning, and billing issues. Revenue reporting belongs after billing is connected. Do not display invented revenue or usage metrics in the initial dashboard.

Agency access is an explicit platform-owner assignment to Jonathan's verified Auth user ID. Registration, checkout, organization ownership, and customer invitations cannot grant this assignment. No public agency enrollment or reseller hierarchy is required for this version.

Opening a customer workspace uses Jonathan's own identity with a visible support-context banner. Record the actor, organization, event where applicable, action, and time. It must not impersonate a customer's login or silently create attendee privileges. Platform operations do not add unrestricted reading of private messages; preserve the reported-message moderation boundary described in the README.

### 2. Customer subaccount

Proposed entry point: `/app/[organizationSlug]`.

Recommended navigation: Overview, Events, Team, Branding, and Billing. The event workspace contains Setup, Event Details, Agenda, Speakers, Sponsors, Venue and Activities, Attendees, Community, and Preview/Publish as applicable to the event's enabled modules.

The customer can maintain company details and brand defaults, create events within their plan, invite permitted team members, and manage event content. Billing access is reserved for the subaccount owner initially. Event-specific staff can work only on assigned events.

A first-run setup guide should walk the customer through the actual work: event name, dates, timezone, brand, modules, agenda, speakers, sponsors, venue, and a launch review. Progress persists so the customer can return later. Required fields and publish blockers must be concrete and relevant to enabled features.

Editing should explain whether a change is a draft or will update published content. A published event needs a preview and an explicit publication action for changes covered by the draft/publish workflow. Existing organizer saves currently update published content; introducing a complete revision system is a separate implementation slice and must not be implied by a new button alone.

### 3. Public and attendee event experience

Proposed shared-domain entry point: `/e/[organizationSlug]/[eventSlug]`. Documented Momentum Builder host aliases should continue resolving to its existing event.

Each event has its own identity, content, modules, publishing state, and attendee rules. Visitors can browse published public content without an account. Organizers choose whether attendee accounts, directory, social wall, and private messaging are enabled. Feature availability must be enforced on the server and in relevant database operations, not just hidden from navigation.

Preserve private-by-default profiles, separate registration eligibility and directory consent, Admin-only attendee contact fields, explicitly assigned sponsor editing, and durable message idempotency. HighLevel remains responsible for SMS under the existing repository instruction.

## Roles and ownership

| Role | Scope | Intended authority |
| --- | --- | --- |
| Platform owner | Event Beast | Jonathan's agency operations and audited customer support. |
| Subaccount owner | One organization | Organization settings, billing, ownership transfer, team, and its events. |
| Subaccount admin | One organization | Event operations and permitted staff management; no ownership transfer or billing control initially. |
| Event admin | Assigned event | Content, registrations, event roles, and event moderation. |
| Sponsor editor | Assigned sponsor within an event | Only that sponsor's allowed content and uploads. |
| Attendee/member | Eligible event | The enabled attendee experience and personal opt-ins. |

Use authoritative membership records. A URL, selected-account cookie, request body, or user-editable Auth metadata must never establish ownership. One Auth identity may hold different roles in different organizations or events.

Organization owner/admin access to event management must be checked explicitly through the event's organization in both server authorization and database policies. It must not create attendee registration, directory presence, or participation consent. Existing Momentum Builder event admins retain their current event permissions; assigning organization ownership is a separate, deliberate operation.

Invitations are organization-scoped, role-limited, expiring, revocable, and accepted by the intended verified identity. Validate membership on acceptance and on subsequent requests. Protect the last organization owner and preserve the existing last-event-admin invariant. Removing access must take effect in authoritative reads without depending solely on stale token claims.

Supabase's [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) supports enforcing ownership inside the database and warns against authorization from user-editable metadata. Apply explicit grants, policies, and allow/deny tests to the new tables.

## Proposed data model

Names below describe responsibilities; reconcile them with the actual schema before creating migrations.

| Entity | Responsibility and key constraints |
| --- | --- |
| `organizations` | Durable subaccount identity, slug, business details, lifecycle status, and brand defaults. |
| `organization_memberships` | Organization, Auth user, role, status, and version. Unique membership per organization/user. |
| `organization_invitations` | Scoped invitation, allowed role, intended identity, expiration, acceptance/revocation state, and hashed token. |
| Restricted platform membership | Jonathan's explicit platform-owner grant, independent of customer roles. |
| `events.organization_id` | Required organization ownership after migration backfill. Preserve all existing event IDs. |
| Existing event settings | Per-event modules and settings, extended through the existing mechanism. |
| Billing accounts/subscriptions | Organization-to-provider identity, current subscription status, plan, and access period. Provider IDs have uniqueness constraints. |
| Plan entitlements and overrides | Available features and numeric limits, with explicit agency exceptions and audit history. |
| Checkout intents and provisioning records | Bind a verified purchaser to a new-account request or an authorized existing account; track recovery and completion. |
| Webhook receipts | Deduplicate provider events and record durable processing state. |
| Domain mappings | Verified hostname to one allowed organization/event target; keep existing aliases. |
| Audit log | Agency, ownership, membership, billing-control, and sensitive publishing operations. |

Continue using the dedicated Event Beast backend. Customers share the platform application and tenant-aware data model; a new subscription does not require a new database or deployment. Isolated development and preview infrastructure remains necessary for testing migrations.

Keep event-owned records event-scoped. If an organization ID is duplicated on an event child record, enforce agreement with the event using database constraints; otherwise derive ownership through the event. Customers cannot move an event into another organization by editing its ownership column.

Public guides may be cached with explicit event keys and tags. Authenticated administration, attendee profiles, contact records, and messages remain outside shared caches. Event selection, browser bookmarks, offline payloads, service-worker scope, and manifests must include the correct event context. Test two events in one browser so switching events cannot show the previous event's content or branding.

## Subscription -> subaccount lifecycle

Stripe is the recommended billing provider for the first integration. No Stripe account, products, prices, or webhooks were inspected or configured during this planning work.

1. A verified buyer chooses a plan and starts a server-created checkout intent. A new-account purchase records that intent; an upgrade or replacement subscription is bound to an organization the buyer already owns. Never trust a browser-supplied organization ID by itself.
2. The billing endpoint verifies the provider signature and records the event durably. The browser's success page only displays provisioning status.
3. Reconcile the current subscription state with the provider. Grant initial paid access only after verified payment and an eligible subscription state; an explicitly supported trial is a separate policy. `incomplete` and failed initial payments do not activate paid access.
4. Provision one organization, its owner membership, defaults, and entitlements in a transaction or recoverable state machine. Use unique checkout/subscription identities so concurrent requests and different lifecycle events cannot create duplicate accounts.
5. Mark provisioning complete and allow onboarding. Durable processing continues even when the buyer closes the checkout tab. A failed welcome email must not roll back an already created account or create another account on retry.
6. Renewals update access, and upgrades change entitlements. A new subscription deliberately replacing a canceled subscription on the same account keeps that organization. Duplicate and out-of-order notifications trigger safe reconciliation.
7. Keep billing status, agency suspension, and provisioning status separate. Cancellation never deletes event history as a side effect.

The billing writer needs a narrowly scoped server capability for verified provisioning and entitlement updates. Ordinary application requests must retain the existing user-scoped authorization model. Do not introduce a broadly privileged service-role client into customer or attendee route handlers. Specify the billing capability and its restricted database operations before implementing that integration.

Stripe documents asynchronous [subscription lifecycle events](https://docs.stripe.com/billing/subscriptions/webhooks) and [webhook signature, ordering, and duplicate-handling requirements](https://docs.stripe.com/webhooks). These are inputs to the proposed reconciliation design, not evidence that billing is already implemented.

Proposed access policy for discussion: show a billing warning during a bounded grace period, preserve access already purchased through its effective end, then restrict new publishing and premium operations while retaining an owner recovery/export path. The exact grace duration, archive visibility, and retention period must be approved before paid launch. Never silently remove an event during an active paid service period.

## Plans and event modules

Model the subscription at the subaccount level. Model event quantity, active published events, staff seats, attendee allowance, storage, and optional features as entitlements where applicable. Keeping multiple events in the data model does not promise unlimited events in a plan.

Effective availability combines account status, the plan entitlement, the organizer's event settings, and the user's permission. Enforce count limits atomically when creating/publishing so concurrent requests cannot exceed the limit.

Start with the reusable guide and organizer tools. Productize existing directory, profiles, social wall, messaging, and sponsor editing as optional modules. Event announcements need a deliberate delivery contract; the existing in-app message indicators must not be advertised as push notifications. Custom domains, templates, advanced sponsor monetization, and integrations can follow the core customer workflow.

Pricing, trials, and usage bands remain unpriced configuration in this plan. Existing 500-attendee ambitions are not proof of measured concurrent capacity. Reuse the repository's qualification approach for each supported plan and workload.

## Momentum Builder migration

The existing event is the first migration case, with its identity and history preserved.

1. Inspect the active database schema, migration history, current deployment, and documented host aliases. Capture counts and identifiers for event content, registrations, roles, conversations, messages, and storage references; establish a tested recovery path before production changes.
2. Rehearse in isolated infrastructure. Create the Momentum Builder organization, attach the existing event by its current ID, and prepare explicit organization-owner assignment. Do not guess the owner from an attendee or sponsor record.
3. Backfill organization ownership and validate relationships before making the column required. Preserve event IDs, role assignments, message relationships, asset paths, and existing links. Keep compatibility with the existing event routes during the transition.
4. Introduce tenant-aware event resolution and authorization in stages. Inventory both documented Momentum Builder hostnames and authentication redirects, then verify actual routing before cutover. Unknown or unverified hosts must not select a tenant or become trusted auth-return origins.
5. Prove the organizer can edit its own event, attendees retain the correct access, and an unrelated customer cannot read private data or change it. Compare before/after counts and relationship integrity.
6. Record completion status for the event only through an explicit lifecycle change. Do not automatically unpublish the guide, close the community, charge the customer, or delete records because the event has ended. Any migration entitlement or billing exception must be recorded explicitly.

Rollback favors an application rollback with compatible additive schema retained. Do not depend on destructive down-migrations after customers have created new records. Define the compatibility window and rehearse recovery before applying migrations to production.

## Build sequence and acceptance

| Milestone | Deliverable | Evidence required to call it complete |
| --- | --- | --- |
| 1. Account foundation and agency access | Organization ownership, memberships, explicit platform owner, account/event authorization, agency subaccount list, manual creation, and customer workspace entry. | Jonathan reaches agency; customer roles are denied. Two organizations and multiple events prove tenant/event isolation through API and direct database access. Owner and event-admin protections hold. |
| 2. Customer can launch an event | Reusable event selection, brand/details settings, guided setup, existing content editors, event module configuration, and a working preview/publish flow. | A customer creates or opens an event, edits agenda/speakers/sponsors/details, publishes, and sees correct content at its own event URL. A second customer's data and branding remain independent. |
| 3. Paid self-service signup | Checkout, durable provisioning, billing status, plan enforcement, owner billing management, and agency provisioning diagnostics. | A test subscription creates exactly one usable account. Duplicate, concurrent, delayed, failed, renewal, upgrade, cancellation, and re-subscription cases behave as specified. |
| 4. Product launch operations | Rehearsed Momentum Builder migration, verified email/auth flow, selected domain support, support auditing, retention/export behavior, and release qualification. | Existing event links and history survive; end-to-end onboarding and tenant boundary tests pass in the deployed test environment; remaining commercial gates are resolved before accepting payments. |
| 5. Expansion | Event cloning/templates, additional domain automation, analytics, sponsor monetization, and selected integrations. | Each capability has a defined customer use case and independent acceptance evidence. |

**First useful release:** combine milestones 1 and 2 into one working customer journey. Jonathan creates a subaccount, assigns its owner, the owner signs in, changes event content, publishes it, and sees the result at that event's URL. Exercise the same path with a second organization. This is the manual account-creation foundation that subscription automation will call later.

Production migration is rehearsed alongside the early milestones; the cutover occurs after compatibility and isolation are demonstrated. Billing code can be developed after the tenancy interfaces stabilize, with no paid launch before the customer workflow is complete.

## Implementation checks

Use the repository's existing `npm run check` for code changes: lint, TypeScript, domain/database tests, and build. Extend the existing database fixture suite for the new authorization and provisioning invariants, and use relevant Playwright coverage for agency/customer/attendee flows. Validate database behavior against an isolated hosted environment as well; fixture results do not establish hosted RLS, storage, email delivery, or concurrency capacity.

The significant scenarios are: a nonowner requesting agency routes; a customer swapping organization/event IDs; invalid cross-event content references; unauthorized sponsor uploads; invitation replay or wrong-identity acceptance; revocation; removal of the last owner/admin; duplicate or reversed billing notifications; simultaneous provisioning and quota enforcement; switching between event URLs with cached public content; and preservation of legacy attendee access and message history.

Record actual commands, results, environments, and unperformed checks in [QUALIFICATION.md](QUALIFICATION.md) when implementation begins. Documentation work alone is not a passing application test run.

## Decisions to close at the appropriate stage

The proposed defaults are one private agency, organizer-level subaccounts, multiple events per account in the schema, manually created accounts before automated checkout, and reuse of the existing Next.js/Supabase application.

Before enabling paid subscriptions, Jonathan must set the actual packages/prices, billing cadence, included limits, trials if any, grace/retention policy, and business billing account. Before the Momentum Builder cutover, verify the intended organization owner and its commercial treatment. Before enabling new branded domains, select the platform domain and verify DNS/account ownership.

These are specific launch inputs. They do not block implementing the agency and subaccount foundation.
