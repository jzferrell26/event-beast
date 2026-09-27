# Event Beast access roles

The user-approved access model has three roles, scoped to the event:

| Capability | Admin | Sponsor | Member |
| --- | --- | --- | --- |
| Attendee app, own profile, saved sessions, directory and messaging | Yes, subject to attendee privacy and messaging consent | Yes | Yes |
| Edit welcome, announcements, agenda, speakers, lunch, venue and settings | All event records | No | No |
| Create/edit sponsor profiles, tiers and contractual placements | All event sponsors | Assigned page content only | No |
| Edit sponsor name, introduction, logo, booth and website/button | Any sponsor | Assigned sponsors | No |
| Publish sponsors, change tiers/order/featured placement | Yes | No | No |
| Add event users, approve/disable access and assign roles | Yes | No | No |
| Assign the sponsor pages another user can edit | Yes | No | No |
| Review reports and recorded launch checks | Yes | No | No |

Admins have full event-management privileges. Private conversations remain participant-scoped; explicitly reported messages can be reviewed by the event team. An admin cannot reassign the login identity attached to another person's verified registration.

## Organizer workflow

Use `/admin/users` to add a single user or edit an existing registration. Choose Admin, Sponsor or Member and its approved/pending/disabled status. Sponsor roles require at least one page from this event. Create the sponsor record in `/admin/sponsors` first if it does not exist, then assign the relevant user to it. Multiple users may edit the same sponsor page; one user may have multiple assigned pages.

Adding users prepares private event registration. It does not send an invitation email automatically. Share the sign-up link through the approved event communication channel; the user must verify the matching registration email before their permissions become effective. CSV imports continue to create Member registrations, and re-importing does not change existing roles.

The original bootstrap admin receives a private attendee profile on first verified access so they can use attendee features as well as the console. Previously bootstrapped `event_admins` entries retain access; new administration uses the registration's `access_role` and approved status. The final active verified admin cannot be demoted, disabled or deleted through the app. Another verified active admin must exist first.

## Sponsor workflow

`/sponsor` lists assigned sponsor pages, including unpublished pages. `/sponsor/[id]` provides an editor and instant attendee-page preview. Saving published page content updates that page; admins keep publication, tier and ranking controls. Logo uploads use the existing decoded/re-encoded, storage-verified path and are restricted to `event-assets/<event-id>/sponsors/<sponsor-id>/`.

Visible sponsor representatives are not editors by default. Representative associations and editing assignments are separate. A private directory preference never prevents an assigned sponsor from maintaining their company page.

## Database and server enforcement

Migration `202609230008_event_roles.sql` adds role/version columns to private registrations, `sponsor_editors`, role-aware helpers, controlled role management, sponsor-content RPCs, and scoped asset policies. Registration ownership still requires verified email. A narrow claim RPC lets eligible users claim access before event publication without exposing draft event data to outsiders.

Only Admin can call `admin_save_event_user`. Sponsor saves use `save_sponsor_page`, which checks assignment/eligibility, a strict content-field allowlist and the expected content version. Sponsors receive no direct UPDATE policy on sponsor records. Direct attempts to change a tier, publication, owner or event boundary are denied. Lost/stale saves return a conflict instead of overwriting a newer edit. Role and page updates are audited. Revoked or disabled Sponsor access takes effect at the database boundary on the next request.

The application runtime continues to use the publishable Supabase key and end-user identity, never a service-role key. Role claims in browser state or user-editable auth metadata cannot grant privileges.

## Qualification and activation

The role tests exercise cross-sponsor/event denial, Member restrictions, Admin control, pre-publication verified claim, bootstrap enrollment, role revocation, stale edits, private profile defaults, asset paths, and last-admin protection. Browser checks cover the Sponsor editor, Admin role-assignment form, unauthorized API payloads, responsive layout and accessibility.

The deployed demo remains read-only for real changes. Apply the migration to the dedicated Event Beast Supabase project and complete hosted role/auth/storage qualification before activating real accounts. Demo browsing alone is not live authorization verification.
