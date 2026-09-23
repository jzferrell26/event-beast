# Event Beast deployment

## Infrastructure boundary

Create a dedicated Supabase project and a dedicated Vercel project under Cuantico AI. Do not configure either application against Listing Studio or Cuantico SMS. GitHub `jzferrell26/event-beast` is the source of truth. HighLevel handles SMS separately.

The dedicated Supabase project has not been provisioned in this implementation session. The connected Supabase tool quoted $10/month. Obtain explicit approval for that recurring project cost before confirming the cost and creating the project. No service-role key is needed by the application runtime.

## Local development

Use Node 22 or newer and `npm ci`. Copy `.env.example` to `.env.local`. To inspect the clearly labeled sample application, set `EVENT_BEAST_DEMO_MODE=true`. Run `npm run icons`, then `npm run dev`; the application uses port 3100. Demo writes are refused. Sample saved-session IDs and walkthrough progress may be stored locally; private data is not.

For live local integration, use a dedicated development Supabase project or the Supabase CLI local stack. Apply every migration in timestamp order. Supply the project URL and publishable key in the two `NEXT_PUBLIC_SUPABASE_*` variables, set `EVENT_BEAST_DEMO_MODE=false`, and configure the auth callback URLs. Local ports in `supabase/config.toml` are intentionally separated from the default Supabase ports.

## Migrations and seeds

All schema, RLS, RPCs, storage policies and Realtime policies are versioned in `supabase/migrations`. Never use dashboard-only schema changes as the deployment record. Review and apply migrations first to development, then staging/preview, then production. A migration failure must stop the deployment; investigate it before continuing.

`node scripts/generate-seed.mjs` generates `supabase/seed.sql` from the explicitly labeled public sample program. This seed creates no attendee registrations or auth accounts. Apply it only to an intentional demo/development environment. The sample dates and venues are not confirmed event logistics.

For production, insert one event and its settings with the canonical slug `momentum-builder-live-2026`; keep it unpublished while configuring the organizer account. Use confirmed event dates or null dates. Create sponsor tiers and confirmed sponsor records through the organizer console. Cuantico’s Platinum sponsorship was supplied by the project owner; other example sponsor agreements are fictional and must not be promoted as real.

After the initial organizer has created and verified an auth account, a database owner must insert the exact event ID and verified auth user ID into `public.event_admins`, with role `owner`. This bootstrap is intentionally unavailable from the public API. Do not grant access by putting admin flags in user-editable auth metadata.

## Authentication and email

Enable email/password authentication with email confirmation and a minimum password length of 12. Configure an approved email sender and production SMTP delivery before inviting the attendee roster. Test actual delivery and recovery to two independent inboxes.

Set the Supabase Site URL to the production HTTPS origin. Add the exact local and approved preview/production callback origins to the redirect allowlist. Avoid broad production redirect wildcards. The application supports `/auth/callback` for PKCE codes and `/auth/confirm` for token-hash email links.

Email templates can direct users to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/more/profile` for verification, `type=recovery` for password recovery, and `type=invite` for invitations. The recovery handler always routes to the password-reset page. Verify each template against the selected Supabase email flow before launch.

Organizer CSV import creates eligibility records, not auth accounts. Share the application’s `/auth?mode=sign-up` link through the approved event registration channel. No mass email or SMS is sent by the import. Attendees must register and verify the matching email to claim their access.

## Vercel

Create the `event-beast` project in the Cuantico AI team and connect the canonical GitHub repository. Use the Next.js preset, Node 22+, `npm ci`, and `npm run build`. Generate icons and commit them before deployment.

Configure each environment separately:

| Variable | Preview/demo | Live production |
| --- | --- | --- |
| `EVENT_BEAST_DEMO_MODE` | `true` for public sample preview | `false` |
| `NEXT_PUBLIC_SITE_URL` | Exact preview origin | Exact production HTTPS origin |
| `NEXT_PUBLIC_EVENT_SLUG` | `momentum-builder-live-2026` | Same canonical event slug |
| `NEXT_PUBLIC_SUPABASE_URL` | Empty for the standalone demo, or dedicated staging URL | Dedicated Event Beast project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Empty for standalone demo, or staging publishable key | Dedicated Event Beast publishable key |

A standalone demo preview cannot qualify real auth, storage or Realtime behavior. Do not present it as the live production event. Prefer a separate development/staging Supabase project or a local stack for migration testing; do not point unreviewed branches at production data.

## Realtime, storage and offline behavior

Database RPCs own messages, idempotency, eligibility, consent, blocks and receipts. Private broadcasts only signal that the client should re-read authorized records. Enable private Realtime access and retain the versioned authorization policy on `realtime.messages`. Do not substitute public channels or Postgres Changes subscriptions with permissive policies.

`event-headshots` is private. The app serves short-lived signed URLs only after profile authorization. `event-assets` is public and is for organizer-approved logos, maps and other public guide imagery. Server uploads accept JPEG/PNG/WebP up to 3 MB, decode and re-encode the image, then verify storage bytes before returning success.

The service worker caches only the marked public guide response, its standalone offline reader, install icons and guide-linked images from the public `event-assets` bucket. App HTML, React Server Component responses, auth, admin data, private profiles and messages are never written to the Cache API. External image links and external navigation/directions are not guaranteed offline; upload the event’s map to the public asset bucket for an offline-readable map.

## Release gate

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Complete the browser and live-infrastructure qualification in `docs/QUALIFICATION.md`. Review Supabase security advisors, Vercel logs, auth delivery/rate settings, storage policy behavior and representative load before announcing the live app. Optional web push is not enabled by this baseline; organizer announcements remain available in the app, and critical SMS is handled in HighLevel.
