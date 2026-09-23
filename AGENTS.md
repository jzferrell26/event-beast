# Event Beast

Canonical repo: jzferrell26/event-beast. Work in this primary conversation; do not spawn workers.

This app serves Momentum Builder LIVE 2026. Next.js App Router + TypeScript, dedicated Supabase and Vercel projects under Cuantico. No shared Listing Studio or Cuantico SMS database. HighLevel owns SMS; do not add SMS code.

Registration eligibility is separate from auth and from public directory visibility. Importing an attendee never publishes their CRM information. Profiles are private by default. Authenticated attendee data, messages, auth and admin responses must never enter the service worker cache.

Attendee contact information is Admin-only. Do not restore email, phone or personal website columns to attendee_profiles, public directory projections or sponsor/member APIs. Registration contact data and attendee_contacts remain private even when a directory profile is visible. The approved dedicated Supabase project is nyhzmazbfctuttizwnxp; it already exists. Do not provision another project or ask for the $10 approval again.

Access roles: Admin has full event management and user/role assignment. Sponsor edits only assigned sponsor pages and uploads only to those sponsor folders. Member uses the attendee app. Sponsor representatives do not automatically receive edit privileges. Preserve the role/version/assignment RPCs and last-admin protection; never authorize from user-editable auth metadata.

All schema changes live in supabase/migrations. Event-scoped composite keys prevent cross-event references. Check event eligibility and authorization in the database as well as at server entrypoints. Messaging must use durable Postgres records and idempotency keys; Realtime carries invalidation notifications, not authoritative message content.

Demo content must be clearly labeled and enabled explicitly. Do not claim demo actions are persisted. Do not fabricate confirmed people, dates, venue details, or sponsor contracts.

Before changing code, inspect its callers. Preserve unrelated changes. Run meaningful authorization/database tests, lint, typecheck, build and relevant Playwright coverage. Record unperformed live checks honestly in docs/QUALIFICATION.md.
