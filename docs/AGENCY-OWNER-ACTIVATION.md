# Agency owner activation

Updated October 16, 2026. Jonathan explicitly selected **jonathan@jonathanferrell.com** as the sole Event Beast agency-owner login. This resolves the email-choice question in [the earlier hosted-preview checkpoint](HOSTED-PREVIEW.md). Do not ask him to choose between his addresses again.

## Current state

Target: the existing isolated preview `tbmipnmffyekkfbslxqx`, under the Event Beast parent `nyhzmazbfctuttizwnxp`. No new database is needed.

A read-only query after the activation attempts confirmed zero preview Auth users and zero rows in `private.platform_owner`. The chosen address is therefore recorded, but no Auth account or agency grant exists yet. No activation email was sent.

The attempted temporary Auth-admin function deployment and normal-signup script creation were blocked by ChatGPT's safety checks before execution. Do not replay those operations through an alternate transport. A subsequent function listing confirmed no Edge Functions were deployed. The unused local setup secret and preparation script were removed. The Plugins connector separately returned `tunnel_client_not_seen`; local file/terminal access through the connector named Desktop remains available.

## Required account step

### Workspace email-link routing

Workspace invitation and recovery links now use `context=workspace` on
`/auth/confirm`. They keep Event Beast branding, verify only after the recipient
presses Continue securely, and then open `/platform/auth?mode=reset`. Expired
links return to workspace sign-in with an actionable message. Existing links
with an allowed workspace `next` destination are also recognized. Callback
codes move to the configured platform host before session cookies are issued.

The preview-only email templates are authored at
`supabase/templates/workspace/invite.html` and
`supabase/templates/workspace/recovery.html`. They are ready for the preview
Auth configuration; committing them does not install them in Supabase. Set the
preview Auth Site URL to the stable Vercel origin in HOSTED-PREVIEW.md before
using them. Keep the production event's existing templates and configuration.

This correction does not create an account, send email, mark an identity as
verified, or grant agency access. The supported preview Auth setup below is
still required. Jonathan's verified live-event account stays in production and
can receive the production agency role during the separately verified rollout.

Use the supported [preview Authentication Users screen](https://supabase.com/dashboard/project/tbmipnmffyekkfbslxqx/auth/users) to establish the chosen account. Keep the password out of chat and source control. Complete email verification through the configured Auth flow; do not infer verification from an event role or user-editable metadata.

The preview still needs its Auth sender, confirmation templates and redirect allowlist configured and verified before general signup/recovery can open. See [hosted preview](HOSTED-PREVIEW.md) for the existing Vercel origin and gates. Do not enable public signup merely to make the owner setup appear complete.

## Prepared owner grant

Run only through an authorized database session targeting preview project `tbmipnmffyekkfbslxqx`, after the selected user is verified. This is an operational data change, not an application migration. It refuses missing/unverified users and conflicting existing platform owners; retrying the same completed assignment is safe.

```sql
begin;
do $$
declare
  chosen_id uuid;
  matches integer;
begin
  select count(*) into matches
  from auth.users
  where lower(btrim(email)) = 'jonathan@jonathanferrell.com';
  if matches <> 1 then
    raise exception 'Expected exactly one chosen Auth account';
  end if;

  select id into chosen_id
  from auth.users
  where lower(btrim(email)) = 'jonathan@jonathanferrell.com'
    and email_confirmed_at is not null;
  if chosen_id is null then
    raise exception 'Verify the chosen email before granting agency access';
  end if;

  lock table private.platform_owner in exclusive mode;
  if exists (select 1 from private.platform_owner where user_id <> chosen_id) then
    raise exception 'A different platform owner already exists; stop for review';
  end if;
  insert into private.platform_owner (singleton, user_id)
  values (true, chosen_id)
  on conflict (singleton) do nothing;
end $$;

select p.user_id, u.email, u.email_confirmed_at
from private.platform_owner p
join auth.users u on u.id = p.user_id;
commit;
```

This query is prepared, not applied. After assignment, verify a real login at [the agency sign-in page](https://event-beast-git-feat-subscription-provisioning-cuantico-ai.vercel.app/platform/auth?next=%2Fagency), then create a controlled customer workspace. Record that evidence before reporting agency activation as complete. Existing database and application checks continue to require verified identity; no auth metadata grants or verification bypasses were added.

Production data, Momentum Builder ownership, subscription activation and payment processing are unchanged by this checkpoint.
