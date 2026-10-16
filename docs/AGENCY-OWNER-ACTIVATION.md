# Agency owner activation

Updated October 16, 2026. Jonathan explicitly selected **jonathan@jonathanferrell.com** as the sole Event Beast agency-owner login. This resolves the email-choice question in [the earlier hosted-preview checkpoint](HOSTED-PREVIEW.md). Do not ask him to choose between his addresses again.

## Current state: preview owner assigned

Target: the existing isolated preview `tbmipnmffyekkfbslxqx`, under the Event Beast parent `nyhzmazbfctuttizwnxp`. No new database is needed.

Jonathan created his preview account through the Supabase dashboard. A database read confirmed the exact account before the owner assignment:

| Item | Verified value |
| --- | --- |
| Email | `jonathan@jonathanferrell.com` |
| Preview Auth user ID | `b210db76-e673-4fbf-bfc6-7f2dc5d47e50` |
| Account created | October 16, 2026, 20:16:08 UTC |
| Email confirmation recorded | October 16, 2026, 20:16:08 UTC |
| Agency-owner assignment committed | October 16, 2026, 20:40:14 UTC |

The singleton row in `private.platform_owner` now points to this verified, active preview account. No password, confirmation status, or production identity was changed by the assignment. This supersedes the earlier checkpoints that reported an empty preview Auth directory and no platform owner.

Database permission checks were run in rolled-back transactions using the `authenticated` database role and explicit test request claims. They are authorization checks, not evidence of an actual browser login:

- `public.platform_access()` returned `true` for Jonathan's exact preview user ID.
- The same function returned `false` for an unassigned synthetic identity.
- The anonymous role cannot execute the agency-access or subaccount-creation RPCs.
- An ordinary authenticated connection cannot directly read or insert the platform-owner assignment.
- No customer organizations existed when access was checked.

Next: sign in at [the agency sign-in page](https://event-beast-git-feat-subscription-provisioning-cuantico-ai.vercel.app/platform/auth?next=%2Fagency) with the password Jonathan chose for this preview account, then use **New subaccount** to begin the customer workflow. Actual hosted owner login and customer publishing remain to be exercised. No activation email was needed or sent in this step.

## Earlier setup attempts

Before Jonathan created the account, temporary Auth-admin function deployment and normal-signup script creation were blocked by ChatGPT's safety checks before execution. No Edge Functions were deployed, and unused local setup files were removed. Those earlier account-creation failures no longer block the owner assignment, which has now been committed as recorded above.

## Workspace email-link routing and remaining delivery setup

Workspace invitation and recovery links use `context=workspace` on
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

The routing correction itself grants no account or role. Jonathan's verified live-event account stays in production and can receive the production agency role during the separately verified rollout. Do not recreate or delete his newly assigned preview account.

The preview still needs its Auth sender, confirmation templates and redirect allowlist configured and verified before general signup/recovery can open. See [hosted preview](HOSTED-PREVIEW.md) for the existing Vercel origin and gates. The owner assignment does not open those gates or certify email delivery.

## Applied owner assignment

The following operational data change was applied only through the authorized database session targeting preview project `tbmipnmffyekkfbslxqx`. It checks the previously read user ID, verified email and active status, refuses a conflicting singleton owner, and safely preserves an identical existing assignment. It is not an application migration.

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
    raise exception 'Expected exactly one chosen preview Auth account';
  end if;

  select id into chosen_id
  from auth.users
  where id = 'b210db76-e673-4fbf-bfc6-7f2dc5d47e50'::uuid
    and lower(btrim(email)) = 'jonathan@jonathanferrell.com'
    and email_confirmed_at is not null
    and (banned_until is null or banned_until <= now())
  for update;
  if chosen_id is null then
    raise exception 'The selected preview account must exist, be verified and be active';
  end if;

  lock table private.platform_owner in exclusive mode;
  if exists (select 1 from private.platform_owner where user_id <> chosen_id) then
    raise exception 'A different platform owner already exists';
  end if;
  insert into private.platform_owner (singleton, user_id)
  values (true, chosen_id)
  on conflict (singleton) do nothing;
end $$;

select p.user_id, u.email, u.email_confirmed_at,
       p.created_at as agency_access_assigned_at
from private.platform_owner p
join auth.users u on u.id = p.user_id;
commit;
```

The assignment is complete; inspect current state before repeating it. Application code and database schema were unchanged in this step. The permission checks above are the validation for this operational assignment; no new application test run or authenticated browser session is claimed.

Production data, Momentum Builder ownership, subscription activation and payment processing are unchanged by this checkpoint.
