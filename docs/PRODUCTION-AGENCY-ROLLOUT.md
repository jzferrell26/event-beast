# Production agency and Momentum Builder rollout

Verified October 16, 2026. This record supersedes the earlier preview-only activation status. Jonathan requested `eventbeast.jonathanferrell.com` for his agency and preservation of `eventapp.momentumbuilder.com` for the existing Momentum Builder event.

## Released application

PR #34 was merged first, then PR #35 was retargeted to main and merged after its checks passed. Production release commit: `f6424aec89978a7e6c2c4a3c9bb551ed1cfd652a`. Its file tree is identical to tested source `427290006a61143cee4147f2be4b0ed2ddfae8cc`: `43b5072e1062ef3acfd756e158526182b65570b3`.

Vercel project `event-beast` (`prj_hN2Ee5abVkKs5t6xbKgESvZFR6bp`) under Cuantico AI (`team_p9rlFBDAQWsrlqwjg4TGkYEv`) deployed the release as `dpl_Bc2Hs3zQGxUABgy85xvPwuxuepXF`, READY, production, region `iad1`. The deployment has all three requested/existing custom-domain aliases. Adding an alias is distinct from configuring external DNS.

The root of `eventbeast.jonathanferrell.com` redirects to `/agency`. The roots of `eventapp.momentumbuilder.com` and `2026live.momentumbuilder.com` retain the existing event experience. Agency authorization is enforced by authenticated account permissions, not by the hostname alone.

## DNS action still required

`eventbeast.jonathanferrell.com` is registered and ownership-verified in Vercel. The final DNS check found no CNAME or A record and reported `misconfigured: true`. The authoritative nameservers are `ns59.domaincontrol.com` and `ns60.domaincontrol.com`; DNS is hosted externally at GoDaddy. No available connected DNS action could write that zone.

Add this record to the `jonathanferrell.com` DNS zone:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `eventbeast` | `323eda2e4a845bca.vercel-dns-016.com` | Default |

This is Vercel's domain-specific recommended CNAME. No root-domain, email, or Momentum Builder DNS records need changing. Public resolution, certificate readiness and an actual browser visit on this new hostname must be verified after the record is saved. They are not certified by the Vercel ownership check.

An existing production sign-in URL available during DNS setup is [agency sign-in on the current Event Beast deployment](https://eventapp.momentumbuilder.com/platform/auth?next=%2Fagency). Opening that specific path does not change the domain's default event page. Use `jonathan@jonathanferrell.com` with the existing production/live-event password. The password created for the isolated preview belongs to a different Auth environment and was not copied.

## Production account and existing event

Target database: the existing dedicated Event Beast project `nyhzmazbfctuttizwnxp`.

| Entity | Verified identity |
| --- | --- |
| Sole production agency owner | `jonathan@jonathanferrell.com`, Auth user `4648ac21-f6ca-4122-8512-30aa9376e98d` |
| Customer subaccount | Momentum Builder, slug `momentum-builder`, organization `5b9cee94-646e-4529-a857-1301953e825e` |
| Existing event | Momentum Builder LIVE 2026, slug `momentum-builder-live-2026`, event `a9bdf080-f47f-538e-94f7-38e4ff996116` |

The verified, active production Auth identity was assigned to `private.platform_owner`. No user, password, confirmation state or attendee identity was replaced. The original event was attached to the new active organization, remained published, and retained its identity, dates, settings and assets. The two operational changes were logged as `organization.created` and `event.adopted` with the agency actor and preserved event hosts.

Momentum Builder is currently agency-managed. No customer-side organization owner was guessed, no invitation was sent, and no subscription was created. Existing event administrators retain their event-specific authority. Assigning the organizer's customer-workspace owner is a later explicit handoff. Event allowance is unset; the account is not enrolled in billing.

The isolated preview `tbmipnmffyekkfbslxqx` remains separate and has no copy of the production event. Use the production deployment to see the real Momentum Builder subaccount.

## Schema and preservation evidence

The two reviewed migrations were applied to production with their source SQL unchanged:

| Repository migration | Verified Git blob SHA |
| --- | --- |
| `20261014160331_agency_subaccounts.sql` | `6ae281d60ed7db11239dfa05aefe13233ef3b8f0` |
| `20261014200756_subscription_billing.sql` | `90ec35840fa8f18afa2bab2d41e5a19b3b8887b6` |

The connector initially used application-time migration versions. After verifying the stored SQL against the source hashes, the two history entries were reconciled to the repository versions. Do not apply them again.

Full-row fingerprints taken before migration and compared after attachment matched across all 34 preexisting event tables. There were zero mismatches. Counts included 483 attendee records, 455 private contact records, 49 agenda sessions, 44 speakers, 37 sponsors, 17 messages, 8 conversations and 18 feed posts. The total of 51 Auth users was unchanged. All 129 storage object IDs, bucket IDs and paths matched their previous fingerprint. New platform audit records are separate from the unchanged legacy event audit log.

Read-only, rolled-back database authorization checks showed Jonathan's exact production identity could see Momentum Builder, manage its organization and administer its event. An existing verified Member could read the event but could not see organizations or manage the workspace or agency. Both verified legacy event administrators retained event access without receiving agency access. These are database permission checks; Jonathan's actual password-based browser login was not performed by the agent.

## Environment configuration

Production settings added: `EVENT_BEAST_PLATFORM_ENABLED=true`, `EVENT_BEAST_PLATFORM_URL=https://eventbeast.jonathanferrell.com`, `EVENT_BEAST_BILLING_ENABLED=false`, `EVENT_BEAST_WORKSPACE_EMAIL_READY=false`, and `EVENT_BEAST_WORKSPACE_RECOVERY_READY=false`.

`NEXT_PUBLIC_SITE_URL` remains `https://2026live.momentumbuilder.com`. Existing Momentum Builder email-readiness settings, event slug, Supabase connection, templates and Auth configuration were preserved. The new workspace overrides keep unqualified workspace email flows closed without disabling the established event email flow. Existing-password sign-in remains available.

## Completed release checks

All three workflows passed on source revision `427290006a61143cee4147f2be4b0ed2ddfae8cc`:

- [Application quality, 38966228609](https://github.com/jzferrell26/event-beast/actions/runs/38966228609): lint, TypeScript, unit/database tests, build and public/legacy/mobile browser suites.
- [Platform integration, 38966228531](https://github.com/jzferrell26/event-beast/actions/runs/38966228531): real local Supabase workflows and explicit agency-versus-event Host routing checks.
- [Billing integration, 38966228520](https://github.com/jzferrell26/event-beast/actions/runs/38966228520): isolated subscription provisioning and billing views.

After deployment, direct HTTPS checks on BOTH `eventapp.momentumbuilder.com` and `2026live.momentumbuilder.com` returned: root HTTP 200 with Momentum Builder branding and no redirect; `/api/release` HTTP 200 with the production merge revision; `/api/guide` HTTP 200 with the original event ID and all 49 sessions, 44 speakers and 37 sponsors; workspace sign-in HTTP 200; and unauthenticated `/api/platform/agency` HTTP 401 with a private/no-store response. The read-only check script and filtered results are saved locally under ignored `test-results/`.

The initial error/fatal runtime-log query scoped to `dpl_Bc2Hs3zQGxUABgy85xvPwuxuepXF` returned no matching logs. This is a short post-release observation, not ongoing monitoring or a capacity test.

## Remaining boundaries and recovery

The new hostname needs the external DNS record and subsequent TLS/browser verification. Workspace SMTP/templates/redirects and actual email delivery remain unqualified. Billing stays disabled; no Stripe-hosted test payment, real test-webhook delivery, portal qualification or live charge occurred during this rollout.

Production security advisors reported no ERROR-level findings. Remaining notices include five intentionally inaccessible private tables with RLS but no direct-access policies, two anonymously callable inherited SECURITY DEFINER RPC warnings, 39 authenticated inherited RPC warnings, and disabled leaked-password protection. These have not been remediated by this domain rollout. References: [private-table notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous RPC warning](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated RPC warning](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The earlier dependency installation's eight high-severity advisories also remain an outstanding review item.

Prior production deployment `dpl_JE8ABnkEZTXNoG6Jn3KtupwTKQEd` at `9b4cb9adddf7055f581adf1a88342f5086f623cc` is the recorded application recovery reference. Prefer application recovery and disabling the platform entry points if needed; do not destructively undo these additive migrations or delete the existing event/subaccount. A rollback's compatibility must be inspected against any subsequent writes before execution.
