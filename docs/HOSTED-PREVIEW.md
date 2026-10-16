# Event Beast hosted platform preview

Updated October 16, 2026. This records actual hosted configuration and its remaining activation steps. A deployed sign-in page is not evidence of a completed agency-owner login or customer onboarding.

## Deployed preview

| Item | Verified value |
| --- | --- |
| Vercel team | Cuantico AI, `team_p9rlFBDAQWsrlqwjg4TGkYEv` |
| Vercel project | `event-beast`, `prj_hN2Ee5abVkKs5t6xbKgESvZFR6bp` |
| Source branch | `feat/subscription-provisioning` |
| Application revision | `fccda64bd0fa4050ee5772e1b186f7613a8922af` |
| Verified deployment | `dpl_CEDUqfjfxd1vdNdNKoUVWCqgiQ8d`, READY, preview, region `iad1` |
| Stable origin | `https://event-beast-git-feat-subscription-provisioning-cuantico-ai.vercel.app` |
| Deployment origin | `https://event-beast-pjhn8pozx-cuantico-ai.vercel.app` |
| Supabase preview project | `tbmipnmffyekkfbslxqx` |
| Supabase preview branch | `event-beast-platform-preview`, `e8925a07-6591-40d9-a359-eb01e8f48e35` |
| Supabase parent | `nyhzmazbfctuttizwnxp`, the existing Event Beast production project |

Open [workspace sign-in](https://event-beast-git-feat-subscription-provisioning-cuantico-ai.vercel.app/platform/auth?next=%2Fagency). Vercel deployment protection may require the owner's Vercel login before the application's separate sign-in.

Jonathan approved the quoted additional branch cost of $0.01344/hour under Cuantico. This branch has already been created; reuse it instead of provisioning another. The provider reports it as healthy, nonpersistent and created without production data.

## Applied configuration

The preview inherited the parent schema. These additional reviewed migrations were applied only to `tbmipnmffyekkfbslxqx`:

- `20261014160331_agency_subaccounts.sql`
- `20261014200756_subscription_billing.sql`

The connector initially recorded application-time migration versions. After application, the two corresponding history entries were reconciled to their repository versions; a subsequent query verified both original versions and names. Do not rerun the migrations merely because the connector's initial timestamps differed.

The following Vercel variables apply only to the `feat/subscription-provisioning` preview branch:

| Variable | Setting |
| --- | --- |
| `EVENT_BEAST_PLATFORM_URL` | Stable preview origin above |
| `NEXT_PUBLIC_SITE_URL` | Same stable preview origin |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tbmipnmffyekkfbslxqx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview project's publishable key; not reproduced here |
| `EVENT_BEAST_PLATFORM_ENABLED` | `true` |
| `EVENT_BEAST_DEMO_MODE` | `false` |
| `EVENT_BEAST_BILLING_ENABLED` | `false` |
| `EVENT_BEAST_EMAIL_READY` | `false` |
| `EVENT_BEAST_RECOVERY_READY` | `false` |

The application was redeployed after these settings were saved. No production deployment was promoted, and no production platform migration, owner assignment, event adoption, or paid checkout was performed.

## Hosted checks completed

- The authenticated Vercel fetch of `/platform/auth?next=%2Fagency` returned HTTP 200 with the Event Beast sign-in form and private/no-store response headers.
- `/api/release` returned HTTP 200 with revision `fccda64bd0fa4050ee5772e1b186f7613a8922af`, mode `live` and `emailSignupOpen: false`. Here `live` means demo mode is disabled; it does not mean billing is enabled or production is released.
- A preview database query confirmed zero Auth users, platform owners, organizations, events and attendees at this checkpoint. No production customer or attendee data was copied.
- The anonymous database role has no SELECT permission on organizations and no EXECUTE permission on agency-access or subaccount-creation RPCs.
- `event_beast_billing` remains NOLOGIN, not a superuser and without BYPASSRLS. It has no direct SELECT permission on organizations or Auth users.
- The public preview Auth settings endpoint returned HTTP 200: email signup supported, signup not globally disabled, and email auto-confirmation disabled. This does not verify SMTP delivery or redirect configuration, and the application's email-readiness gate remains closed.
- A read-only production query confirmed `public.organizations` is absent and neither new platform migration is recorded there.

The Vercel fetch wrapper classified the unauthenticated `/api/platform/agency` request as `deployment_authentication_required` with HTTP 401. Its output did not expose the application response, so this is not counted as a verified application-level authorization test.

## Advisor findings

The preview security-advisor query reported no ERROR-level findings, but it did report warnings and informational notices. This is not a clean full security audit:

- Five [RLS-without-policy informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) on the private owner/creation tables and private billing tables. Their direct table access is deliberately denied; operations use scoped functions.
- Two [anonymous SECURITY DEFINER execution warnings](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) on `can_read_event` and `is_event_admin`.
- Thirty-nine [authenticated SECURITY DEFINER execution warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) on inherited event RPCs. These require review of their guards; do not blindly revoke functions used by existing event policies.

Existing dependency advisories remain tracked in [billing qualification](BILLING-QUALIFICATION.md). This deployment work does not remediate or certify them.

## Remaining owner and customer activation

No preview Auth user or platform-owner assignment exists yet. Jonathan has two known verified identities in the production event, but neither has been designated as the sole preview agency identity. Obtain his address choice; do not infer platform ownership from an event role or copy production authentication credentials.

Configure the preview Auth site URL, explicit callback/redirect allowlist, sender and templates through the supported Supabase dashboard or authenticated management API. The connected SQL/project tools do not expose an Auth-configuration action, and no Supabase management credential is configured in the working terminal. Sender delivery and recovery must be verified before opening the application's corresponding readiness gates.

Create and verify the chosen preview Auth identity through a supported Auth flow, then grant that exact user ID the singleton platform-owner assignment from the authorized database session. Preserve a conflicting existing assignment rather than replacing it automatically. Verify an actual agency login, account creation, customer invitation acceptance, event editing and publishing, plus a second customer's denied access.

The payment integration is not activated. Follow [billing implementation](BILLING-IMPLEMENTATION.md) for the restricted connection, Stripe test keys, signed webhook endpoint, test offer and portal configuration. Complete the actual Stripe-hosted test purchase and webhook/portal checks before opening paid enrollment.

## Source and local checkpoint

The Windows shared folder `/chat-on-steroids-projects/Event Beast` contains the subscription branch at the deployed application revision. It was clean before adding this documentation. The connector named Desktop provides working file and terminal actions; Core and Plugins still returned `tunnel_client_not_seen`. That tunnel error is not a read-only permission state.

The existing final application, platform and billing CI runs for this application revision passed, as recorded in PR #35. The hosted checks above are narrower than those local-service tests and do not establish hosted authenticated onboarding, mailbox delivery, payment processing, or capacity. Changes in this checkpoint are documentation only.
