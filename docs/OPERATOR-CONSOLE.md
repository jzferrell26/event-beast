# Event operator console handoff

## What this release changes

Speakers and sponsors already have list upload buttons from PR #6. This increment validates those files before transfer and saves only the image field, so an upload cannot overwrite another organizer's newer biography, publication, booth, or tier edits. Uploads inside an edit form set the form's URL; **Save changes** is still required to save that form.

The session editor now includes a searchable **Speakers for this session** selector. Add multiple speakers, remove individual assignments, or clear the selection. The session and its speaker links save in one transaction. If a speaker is invalid or a write fails, the database retains the previous session and assignments. Missing selection data disables saving rather than silently clearing links.

## Organizer workflow

1. Open **Agenda → Speakers** (`/admin/speakers`). Edit a name, role/title, biography, source link, or publication status. Use **Upload photo** on the row for an immediate image replacement, or upload inside **Edit** and then select **Save changes**.
2. Open **Sponsors** (`/admin/sponsors`). Use **Upload logo** in the same way. Images must be JPG, PNG, or WebP, no larger than 3 MB. The server verifies image contents, strips metadata, and stores re-encoded WebP in the public event-assets organizer folder; private attendee portrait storage is not used.
3. Open **Agenda → Agenda sessions**. Edit the session and select its speakers in the same form. Clock inputs use the event timezone shown in the dialog, not the device timezone. End must be after start. Unpublished speakers remain hidden from attendees even when selected.
4. When the form displays an imported source question, inspect **Launch readiness** after saving. The existing review trigger reopens a confirmed or excluded decision when session details change. Changing speaker links alone does not change the existing review-trigger behavior.
5. Confirm the intended published content in the attendee guide after refresh. Published saves invalidate the shared public-guide cache; previously cached offline phones may show the previous guide until they reconnect and refresh.

The generic **Session speakers** screen remains available. No attendee navigation, layout, official logo, help text, directory, messaging, or sponsor-edit permissions change. Door check-in is deferred. Demo mode remains read-only.

## Separate production Admin handoff

The approved email is **team@momentumbuilder.com**. A current Admin should find that registration in `/admin/users`, verify its identity, and use the existing form to assign **Admin** and **Approved**. Preserve other intended access settings. The form uses the audited, versioned `admin_save_event_user` RPC and last-admin protection; do not set a role through user-editable authentication metadata or a new service-role API.

Adding a registration does not send an invitation email. The owner must share the existing sign-up/sign-in link through the approved channel after the email-delivery launch gate is satisfied. The same email must be verified and claim the registration. Confirm the correct event name and absence of the demo banner at `/admin` using that account. This code change does not assign the role or certify mailbox delivery.

## Release sequence

Apply `supabase/migrations/20260929154113_event_operator_session_save.sql` to the **dedicated Event Beast project** `nyhzmazbfctuttizwnxp` before deploying the new session editor. It adds only the SECURITY INVOKER RPC with explicit authenticated execution permission and no anonymous execution permission. Existing event RLS, composite foreign keys, and audit/review triggers still govern its writes.

Then deploy the approved source commit and verify an authorized organizer can load links, save a controlled session change, and see it after refresh. Test an image upload and a refused Member/Sponsor request on the deployed build. Record those real checks separately from local fixtures. Do not apply this migration to another app's database or re-provision the event backend.

Rollback of the app to the preceding build does not require removing this additive RPC; the old editor remains compatible. Source qualification does not by itself establish production migration, deployment, or `team@momentumbuilder.com` account readiness. See `QUALIFICATION.md` and the PRD's `qa/implementation.md` for evidence and outstanding handoff steps.
