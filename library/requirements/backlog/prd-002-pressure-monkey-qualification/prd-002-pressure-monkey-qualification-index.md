# PRD-002: Pressure Monkey — event capacity and recovery qualification

> **Status:** Authored / backlog. Implementation and new load experiments have not started.
> **Priority:** P0 before the full attendee invitation wave; not a blocker on drafting other launch work.
> **Owner / execution approver:** Jonathan Ferrell.
> **Scope:** Momentum Builder LIVE 2026 first; reusable product qualification after the event.
> **Source baseline:** `869d9120bbfc8ee89436e9d003516b0475b7b589`, inspected September 30, 2026.
> **Authorization:** Author the work. This document does not authorize infrastructure changes, paid resources, load generation, failure injection, bulk email or a production restore.

## Outcome

Prove what the current Event Beast release can handle when the room opens it together, what survives an interruption, and how an operator recovers. Deliver separate verdicts for **capacity**, **controlled-failure resilience**, **recovery**, and **account-email readiness**. Do not compress them into an unsupported “500 people passed.”

Pressure Monkey is our project name, not an installation of Netflix Chaos Monkey. Netflix's tool terminates instances to exercise service resilience; the hosted Vercel/Supabase event needs workload simulation and bounded client/test-environment failures instead. [Netflix primary reference](https://netflix.github.io/chaosmonkey/).

## What the existing evidence does and does not prove

| Evidence in this repository | Verified scope | Still unproven by that evidence |
|---|---|---|
| [`hosted-auth-burst.json`](../../../../docs/hosted-auth-burst.json), September 23 | 500 synthetic verifications, sign-ins and claims eventually completed | Current full-app throughput, public signup and mailbox delivery |
| Same report, password phase | 998 HTTP 429 responses/retries; p95 29.37 seconds; 500 eventual successes | A fast arrival experience. A successful retry is not a successful first attempt. |
| [`attendee-intake-hosted-qualification.json`](../../../../docs/attendee-intake-hosted-qualification.json), September 30 | Safe isolated 500-registration import and repeat; cleanup completed | 500 simultaneously active accounts or invitations |
| [`MOBILE-CHAT-FEEDBACK.md`](../../../../docs/MOBILE-CHAT-FEEDBACK.md) and its qualification script | Functional message indicators, permitted photos, role/privacy boundaries, viewport regressions | Sustained concurrent traffic, provider headroom or physical venue Wi-Fi performance |

Preserve these reports. New measurements must identify their own exact deployment, configuration, data shape, clock, generator and exclusions. Never relabel an old synthetic test as a fresh end-to-end event test.

## Work packages

| Package | Deliverable | Initial state |
|---|---|---|
| [002A: capacity](./prd-002a-capacity-and-workload.md) | Repeatable smoke, ramp, arrival, soak, Realtime and asset workload | Not implemented / not run |
| [002B: failure and recovery](./prd-002b-failure-and-recovery.md) | Controlled disconnect/timeout drills and a practiced restore/rollback runbook | Not implemented / not run |
| [002C: implementation backlog](./prd-002c-implementation-and-acceptance.md) | Task IDs, acceptance gates, evidence contract and execution handoff | Authored only |
| [Run-approval example](./run-approval.example.json) | Inert, deliberately incomplete safety contract | Not valid for execution |

## Non-negotiable boundaries

The production Supabase project is `nyhzmazbfctuttizwnxp`; the real event is `a9bdf080-f47f-538e-94f7-38e4ff996116`. Protect both by default. Protect the branded event domains, `event-beast.vercel.app`, their redirects and any deployment pointing to that backend. A differently named preview or synthetic event in the same project is **data isolation, not resource isolation**.

Reuse an already approved isolated test environment if one exists. Its existence and capacity have not been established by this authoring pass. Do not create another Supabase project, branch, paid generator or provider subscription without explicit approval. If suitable isolation is unavailable, local functional tests may proceed when implementation is authorized, but hosted capacity/failure qualification remains blocked.

No terminating services, dropping tables, deleting projects, disabling RLS, weakening auth, changing DNS, removing spend caps or enabling automatic email as part of these tests. HighLevel remains responsible for SMS. Do not send traffic to linked sponsor/menu/community sites or other unapproved third-party hosts.

The load generator uses real synthetic **Member sessions**, with only explicitly assigned synthetic Admin/Sponsor canaries. Service/admin credentials belong only in a separate, bounded fixture provisioner and read-only auditor; they must not replace attendee authorization on measured requests. No real attendee conversations, invitations, contact exports or headshots are used as test data.

## Approval and automatic stop contract

Before any hosted run, a named operator reviews a manifest containing exact app/backend/event identifiers, deployment SHA, workload profile, UTC start/expiry, allowed paths/hosts, credential references, concurrency and request/byte/write caps, numeric estimated-cost ceiling, infrastructure limits and rollback owner. Missing/null limits or missing approval mean **refuse to start**, never “unlimited.” The example JSON is a specification, not an implemented control.

Default `allow_production=false`, `allow_faults=false`, `allow_external_email=false`. Production requires a distinct approval for a bounded live-validation window after isolated qualification. It does not inherit approval from a prior code merge or this PRD. Elevated stress and restore experiments remain isolated-only.

Implement both runner thresholds and an independent watchdog. Abort new traffic immediately on wrong target, privacy/role leakage, duplicate durable writes, loss of an acknowledged write, unexpected real email or mutation outside the fixture manifest. Stop on budget/traffic limits, operator kill, stale safety telemetry or provider hard-cap proximity. Proposed rolling-window stop rules: more than 2% unexpected failures for 60 seconds with at least 100 attempts, or critical endpoint p95 above 5 seconds for two such windows. Target breaches still fail the report even below abort levels.

Provider dashboards may report billing late. Enforce local request/byte/write/socket/time caps as well as projected cost; a billing alert alone is not a kill switch. On stop, cancel scheduling, close sockets, drain bounded in-flight requests, remove fault rules, audit final writes and run exact-ID cleanup. Failure to clean up leaves the run **incomplete**, not green. Prove watchdog and interrupted-run recovery locally before hosted load.

## Release decision

**Pass:** the exact requested operating profile and all required integrity/privacy checks pass; evidence is complete; recovery objectives are demonstrated or explicitly accepted with their measured limitations; fixture cleanup is verified. **Fail:** a target or invariant fails. **Blocked/not run:** environment, capacity, sender, approval, monitoring or recovery prerequisites are missing. An incomplete or undersupplied generator run cannot pass.

Synthetic session preparation can qualify a logged-in workload without sending account mail. It must leave `account_email_ready=not_tested` unless the independent sender/inbox workflow in [`ATTENDEE-ROLLOUT.md`](../../../../docs/ATTENDEE-ROLLOUT.md) is actually completed. Bulk attendee rollout remains gated on both appropriate operational qualification and account-email readiness.

After Momentum Builder, parameterize the same harness by event/modules/plan and observed peak usage. Multi-tenancy, billing and a commercial certification dashboard remain post-event work; this PRD does not expand the launch into a SaaS rebuild.
