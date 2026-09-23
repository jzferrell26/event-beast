# Event Beast architecture

## Product boundary

An event companion for approximately 500 attendees, with a mobile attendee experience and a constrained organizer console. The first event is Momentum Builder LIVE 2026. Event-scoped records allow future events without implementing a white-label SaaS layer.

Next.js renders the public guide and authenticated screens. Route handlers authenticate each private request. Supabase Postgres is the authority for membership, consent, content, saved items, moderation and messages. Supabase RLS independently enforces access when its API is called directly. There is no service-role key in the runtime application.

Dedicated Supabase and Vercel projects belong under Cuantico. Existing application databases must never be used. GitHub remains the source of truth. SMS is entirely outside this product and remains with HighLevel.

## Identity and privacy

Auth proves control of an email account. An organizer-approved attendee record grants event access. Claiming a record requires a confirmed email match from auth.users. Profile visibility and messaging consent are separate opt-in fields. Imported registration email/name are private; only the attendee's chosen profile fields are exposed to eligible directory viewers. Disabled attendees lose directory, messaging, storage and realtime access.

## Messaging

A conversation has exactly two event attendees, canonical ordering and a unique pair constraint. Send operations run as transaction-scoped RPCs, lock the conversation, validate both memberships, consent and blocks, and use a sender-generated UUID idempotency key. Retries return the original durable message; reuse with different text is rejected. Clients render pending/failed states and reconcile from the database after reconnect or private Realtime invalidation. No message text is broadcast. Database read authorization remains authoritative after a channel was joined. Read cursors are monotonic server-generated sequence positions. Messages are paginated by sequence.

## Offline

A dedicated public guide JSON endpoint exposes only published public essentials. The service worker caches that endpoint, its standalone offline viewer, app icons and immutable assets. It does not cache navigated Next.js HTML, React Server Component responses, auth, private API responses, profiles or inbox data. Offline messaging is visibly unavailable and failed sends can be retried with the same idempotency key.

## Environments

Local and preview can explicitly enable labeled demo content. Production requires dedicated Supabase configuration and demo mode disabled. Migrations are reviewed and applied through the CLI. Seed data is opt-in and always marked sample. No production secrets are committed. Preview must use a separate development database/branch when live private data is introduced.

## Primary references

- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase Realtime authorization: https://supabase.com/docs/guides/realtime/authorization

Documentation checked September 22, 2026. Dependency versions are pinned in package-lock.json after registry resolution.
