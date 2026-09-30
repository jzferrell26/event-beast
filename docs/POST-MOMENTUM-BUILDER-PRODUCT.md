# Post–Momentum Builder: Event Beast product track

## Boundary

This is **post-event product work only**. It must not expand the Momentum Builder LIVE 2026 launch scope. For this event, ship the organizer-confirmed information website: no attendee People directory, chat/messaging, attendee profiles, or in-site notifications/announcements. HighLevel/mass texting remains the event notification channel.

The current event is the proving ground, not the permanent product architecture. Preserve reusable capabilities that already exist behind the event-specific experience, but do not re-enable them for Momentum Builder unless the organizer changes scope.

## Product thesis

Turn Event Beast into a configurable, sellable event platform that can be launched for a new event without a custom-code engagement. The product should support multiple event organizations, events, brands, domains, admins and optional attendee experiences from one platform.

The organizer should be able to choose the event experience rather than inherit Momentum Builder's choices. Core modules should be independently configurable:

- Public event website: branded home, agenda, speakers, sponsors, venue, meals, FAQs and offline essentials.
- Organizer console: content editing, publishing, schedule changes, sponsor creative placement, permissions and launch readiness.
- Attendee accounts: optional. Public-only events should require no attendee account.
- People directory and attendee profiles: optional, private by default and event-scoped.
- Private 1:1 messaging: optional. Existing durable Postgres messaging, retry/idempotency, read state, blocking/reporting and realtime invalidation are reusable foundations.
- Announcements/notifications: optional module with deliberate delivery channels (web/in-app, push, email, SMS integrations) rather than a notification bell that does not reach attendees.
- Sponsors: tiers, logos, placements, creatives, sponsor admins and configurable entitlements.
- Agenda: full or simplified public views, sessions, speakers, rooms, tracks, favorites and sponsor placements.
- Custom domains and white-label branding.

## Commercialization architecture

Refactor Momentum Builder assumptions into tenant/event configuration. Introduce Organization -> Event as the durable tenancy model. Every event-owned record and storage object remains event-scoped; organization access must not weaken current event-level RLS.

Separate platform roles from event roles. Platform/Super Admin manages customers and product operations. Organization Owner/Admin manages organization billing and events. Event Admin manages one event. Sponsor Admin manages explicitly assigned sponsors. Member/Attendee uses only enabled attendee modules.

Make feature flags/entitlements explicit per event: public site, attendee auth, directory, profiles, messaging, announcements, offline guide, sponsor ads, custom domain, push/SMS integrations, and other future modules. Do not implement these as one global environment switch.

Create a reusable event setup flow: create event -> choose modules -> brand -> domain -> dates/timezone -> import/build agenda -> speakers -> sponsors -> venue/meals -> organizer users -> attendee import if needed -> review -> publish.

## SaaS workstream

After Momentum Builder:

1. Remove event-specific copy, IDs, dates, branding and navigation assumptions from application code.
2. Add multi-organization/multi-event tenancy and a platform administration layer.
3. Build event creation, cloning/templates, onboarding and self-service organizer setup.
4. Convert module switches into database-backed per-event configuration with authorization tests.
5. Restore and productize optional directory/profiles/private messaging behind those event flags.
6. Productize notifications with real delivery semantics and channel integrations.
7. Add white-label branding, custom-domain onboarding and domain/auth callback automation.
8. Add billing/entitlements, plan enforcement, usage tracking and audit visibility.
9. Add import/export, event cloning, archival and retention controls.
10. Add product analytics, operational observability, abuse/moderation tooling and customer support controls.
11. Create a repeatable launch qualification suite for every tenant/event, including mobile, accessibility, auth/RLS, offline behavior and role boundaries.

## Product packaging questions to decide after the event

- Pricing unit: per event, annual organization subscription, attendee bands, or hybrid.
- Which modules belong in the base plan versus paid add-ons.
- Whether messaging is native, community-integrated, or both.
- Whether SMS is a native paid integration or remains customer-owned through providers such as HighLevel.
- Sponsor monetization: placement inventory, sponsor portals, lead capture and analytics.
- Event templates and vertical-specific starter kits.
- Agency/reseller/white-label model.

## Momentum Builder evidence to capture

Treat the live event as product discovery. After the event, record organizer setup time, last-minute edit volume, most-used public pages, mobile/offline behavior, sponsor-ad operations, support issues, attendee questions, domain/auth friction, and what Sonia/Don wished they could self-manage. Convert those observations into product requirements rather than making speculative changes during launch week.

## Explicitly parked until after Momentum Builder

Do not turn the current event into the SaaS migration. Multi-tenancy, billing, generic branding, self-service event creation, restored attendee chat/directory, generalized notification delivery, reseller controls and product pricing are parked until the event has shipped and its lessons are documented.
