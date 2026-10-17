# Guided event setup and launch review

Implementation branch: `feat/guided-event-setup`. Built on the production agency rollout; the custom agency DNS work is independent.

## Organizer workflow

Opening an event now starts with **Setup guide**. Eight checks cover dates, branding, the welcome message, event days, agenda, speakers, sponsors and venue. Each check opens its existing editor. The suggested next action prioritizes missing required dates, then saved content needing publication review, then optional additions. **Review & publish** opens the launch review.

Progress is derived from saved event records and reloads after edits, deletion and publication changes. It does not depend on a browser-local checklist or claim that a previously completed item is still valid after its content changes. Switching sections retains the existing unsaved-change confirmation.

Dates remain the only publishing requirement in this release. Missing logos, speakers, sponsors or a venue are optional suggestions. Sections with draft records show the included and excluded counts. Agenda sessions marked Published are still excluded when their parent event day is a draft; the guide calls out that dependency. The preview remains the final way to inspect the public result.

This release does not introduce staged revisions for published events. Saving a published content record updates the guide immediately, as the existing editor states. No background process publishes, unpublishes or changes event records.

## Implementation and authorization

`GET /api/platform/organizations/[slug]/events/[id]/setup` uses the existing verified identity, organization-management and event-ownership checks. All database requests use the caller's Supabase client and an explicit event filter. Responses are private/no-store. The response contains checklist summaries, not attendee details or raw content rows.

Counts are exact database counts, independent of editor pagination and lookup-list limits. Agenda visibility joins the event day and requires both records to be published. A failed count or database permission check returns an error rather than presenting a false empty or completed checklist. There is no schema migration, new role or permission grant.

The read-only checklist and content counts are guidance at fetch time, not an atomic snapshot or an authorization token. Existing versioned database publication actions remain authoritative. A failed review fetch prevents the UI from claiming readiness for a new publication, while an existing published event can still be unpublished.

## Verification

The added unit/API tests cover required versus optional checks, draft and partially published content, hidden parent days, counts beyond editor pagination, progress after unpublishing/deletion, scoped database reads, and denied or failed access.

The real local Supabase browser journey now starts with an undated draft, verifies publishing is disabled, saves dates, creates content, unpublishes the parent day, checks the hidden-session warning after a reload, republishes the day, and continues through event publication. It also checks anonymous and second-customer access to the setup endpoint and captures desktop/mobile screenshots of the guide.

Run the normal quality, platform integration and billing integration workflows before release. Record their actual run results and source revision in the pull request. These test definitions do not themselves assert passing results or an authenticated production browser test.

The public Momentum Builder domains, event identity, attendee data, billing activation and email-delivery settings are outside this change.

References checked for the read queries: Supabase [exact counts](https://supabase.com/docs/reference/javascript/select) and [inner joins](https://supabase.com/docs/guides/database/joins-and-nesting).
