# Pressure Monkey: operator guide

## Current implementation boundary

The first PRD-002 slice implements **local preflight and stop controls**, not the full hosted load suite. No k6 profile, hosted fixture provisioner, distributed Realtime driver, database restore, or live stress run is certified here. The CLI has no production dispatch path. An approval JSON is a mechanically checked contract, not an independently authenticated authorization document.

The [in-work PRD](../library/requirements/in-work/prd-002-pressure-monkey-qualification/prd-002-pressure-monkey-qualification-index.md) retains the remaining lifecycle/workload/recovery tasks and proposed performance targets.

## Commands available now

| Command | Behavior |
|---|---|
| `npm run pressure:preflight` | Read local source/configuration fingerprints and workload timers. No network. |
| `npm run pressure:preflight -- --inspect-public` | Additionally read `/api/release` and `/api/guide` once each on the two fixed production aliases: four credential-free GETs total. No redirects, asset crawls, sign-ins, or writes. |
| `npm run pressure:validate -- <manifest.json>` | Validate exact targets, approvals, time window, permissions and all numeric budgets. Invalid input exits 2; no network. |
| `npm run pressure:dry-run -- <manifest.json> --evidence <evidence.json>` | Also compare fresh supplied target evidence and Realtime headroom. Never schedules traffic. |
| `npm run pressure:self-test` | Seven sequential local IPC-only rehearsals: completion, attempt ceiling, stalled scheduler, stale safety telemetry, cancellation, forced stop, and expiry. No app/provider requests. |
| `npm run test:pressure` | Exercise invalid manifests, aliases/backends, allowed paths, budgets, redirects, payload bounds and the separate-process watchdog. |

The default CLI command is `preflight`. `run` always exits blocked in this slice, even after mechanical manifest validation. `prepare`, `abort`, `audit`, and `cleanup` are explicitly unsupported and take no hosted action; no fixtures exist for these commands to remove yet. Unknown flags such as `--force` are refused.

Reports are timestamped under ignored `test-results/pressure-monkey/`; they are not deployed assets. Do not commit raw credentials, user sessions, provider configuration, signed URLs, or traces. The public inspector saves only allowlisted release facts and aggregate guide counts—not response bodies or attendee data.

## Guardrails implemented

Production aliases, preview-name variants, the production Supabase reference, and the real event ID are denied by default. A superficially isolated hostname cannot pass a target check with a production backend. Hostnames are exact; sponsor/menu/community hosts and wildcard paths are not accepted. URI credentials, ambiguous dot/encoded-separator paths, and hidden redirects are rejected. The bootstrap request allowlist permits reads only; write adapters require a subsequent reviewed implementation with exact synthetic ownership.

Manifest parsing is strict and rejects unapproved examples, missing fields, unknown keys, NaN/infinity/negative limits, expired/future approvals, runs exceeding their approved window, undeclared faults and external email/provider/billing permissions. The approval window is at most 24 hours; an individual profile's duration ceiling is at most two hours. Normal resource demand may consume at most 80% of the observed Realtime connection allowance, including existing connections. The evidence must be no more than five minutes old and identify the exact app, harness, deployment, project and event. Supplying an evidence file does not prove that someone actually collected it: the operator must review its provenance.

`BudgetLedger` reserves the worst-case transfer and estimated cost before attempts. Failed attempts and retries are not refunded. Attempts, writes (including future setup), transferred bytes, estimated cost, elapsed time, sessions and sockets each have an independent limit. Once stopped, a ledger cannot resume issuing operations. Billing estimates are not actual provider charges; hosted runs will also need provider telemetry and conservative rates.

The local watchdog supervisor runs separately from its fixed canary scheduler. A blocked scheduler cannot block the supervisor timer. Stale heartbeat or safety telemetry, expiration and operator cancel end the owned child; ignored stop messages escalate to termination after 200 ms. Each local rehearsal awaits process exit before reporting cleanup. These local simulations create **no HTTP connections, database rows, or provider accounts**. They do not prove future hosted socket teardown or exact-ID database cleanup.

## Read-only observations from this implementation pass

At `2026-10-01T00:41:26Z` (September 30 in Central time), the connected Supabase read identified production project `nyhzmazbfctuttizwnxp` as `ACTIVE_HEALTHY`, in `us-east-1`. The branch listing returned no development branches. No approved isolated test target has been established by this pass; that is not a claim that no other possible environment exists.

A read-only SQL snapshot reported PostgreSQL 17.6, 60 configured database connections, 13 observed connections (one active), and 20 applied migrations. **Database connections are not attendee sessions or Realtime socket limits.** These point-in-time numbers neither prove a 500-attendee ceiling nor diagnose saturation. Effective Auth/Realtime quotas, compute/pooler limits, Vercel limits, provider billing and recovery capabilities remain unverified.

The local runtime did not expose a Supabase Management API token through `SUPABASE_ACCESS_TOKEN`; no credentials were scraped or new token generated. No plan was upgraded, spending protection removed, branch created, email sent, or runtime setting changed. The preflight report states unresolved limits rather than substituting a plan-name default.

## What unlocks hosted work

Resolve an already approved isolated target or explicitly approve its provisioning/cost; confirm provider settings and a finite execution budget. Then implement and test fixture prepare/resume/audit/cleanup, normal-user sessions, protocol-accurate workloads, provider telemetry and rolling-window aborts. Capacity runs must not substitute a direct Supabase service-role benchmark for the browser-equivalent application path.

The first hosted experiment is the five-user smoke profile, not a 500-user blast. Advance only after its identity, accounting, observability, stop, integrity and cleanup results pass. Each larger or fault profile requires its own reviewed operating window and caps. Automatic account email remains an independent gate.

## Primary design references

- [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits): configurable per project; documented defaults are not proof of this project's effective settings.
- [Supabase Auth limits](https://supabase.com/docs/guides/auth/rate-limits): preserve throttling in first-attempt and eventual-outcome reports.
- [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/): future scenario thresholds do not replace a rolling-window safety monitor.
- [PRD-002 recovery scope](../library/requirements/in-work/prd-002-pressure-monkey-qualification/prd-002b-failure-and-recovery.md): DB, files, configuration and app rollback remain separate rehearsals.
