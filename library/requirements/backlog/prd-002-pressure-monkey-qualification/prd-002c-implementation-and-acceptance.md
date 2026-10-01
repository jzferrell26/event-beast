# PRD-002C: Implementation backlog and execution handoff

> **Status:** Authored only. None of the paths marked proposed below exist as a completed harness.
> Parent: [PRD-002](./prd-002-pressure-monkey-qualification-index.md).

## Ordered work

| Task | Implementation and acceptance | Dependency |
|---|---|---|
| PM-001 | Read-only environment/limit inventory; resolve an approved isolated target and record effective provider settings with timestamp | Execution planning approval |
| PM-002 | Build fail-closed target/manifest validator, expiry, path/host allowlist, all resource budgets, independent watchdog and dry run; unit-test missing approval, wrong backend, hidden redirect and operator cancel | PM-001 |
| PM-003 | Synthetic fixture lifecycle: prepare, normal-user sessions, role/consent subsets, run ledger, cleanup and audit; interrupted setup is resumable and never touches real records | PM-002 |
| PM-004 | Capture browser-equivalent route, timer, asset, auth and Realtime behavior; derive actual HTTP/socket/write forecasts; validate one synthetic pair and five-user smoke | PM-003 |
| PM-005 | Implement 002A profiles with tagged endpoint/stage metrics, normal-session auth, proper arrivals, generator health and explicit threshold failures | PM-004 |
| PM-006 | Run approved isolated ramp/arrival/soak plus genuine private-channel telemetry and small browser canaries; investigate/retest the first limiting subsystem | PM-005 + approved manifest |
| PM-007 | Implement and run individually approved 002B faults; prove post-commit retry and audit every accepted write; restore all injected conditions | PM-004, then PM-006 for larger cohorts |
| PM-008 | Inventory database and asset recovery, author rollback compatibility matrix and run isolated restore/tabletop drills; record measured RTO/RPO limitations | PM-001 + restore-target approval |
| PM-009 | Review result, cleanup, cost, exclusions and remaining blockers with Jonathan; a bounded production validation is optional and separately approved | PM-006/007/008 |
| PM-010 | After the event, parameterize by organization/event/module and observed workload; add repeatable product release qualification without claiming a universal capacity guarantee | Event completed |

“No suitable hosted isolation,” “no sender approval,” and “effective quota not established” are explicit blockers. They do not justify substituting the production backend or enabling email. No subagents are required or authorized by this plan.

## Proposed implementation layout

```text
tests/load/pressure-monkey/       k6 scenarios, route/identity helpers, metrics
scripts/pressure-monkey/          preflight, fixture lifecycle, orchestrator, watchdog, report
tests/resilience/                bounded browser/network fault scenarios
test-results/pressure-monkey/     ignored raw artifacts and private runtime state
<this PRD>/qa/                   sanitized run evidence only after execution
```

These are planned paths, not ready-to-run commands. Implement a dry-run-default CLI with separate `preflight`, `prepare`, `run`, `abort`, `audit` and `cleanup` operations. Input must bind the manifest to a specific scenario revision and immutable deployment. A convenience production URL or a single `--force` flag must not override safety checks.

The provider admin credential is available only to setup/audit/cleanup, never to scenario workers. Scenarios use normal least-privilege tokens and maintain per-user cookies/refresh state. Tokens and credentials stay in ignored local state or an approved secret store; reports contain references rather than secrets.

The existing `.github/workflows/quality.yml` stays unchanged in this authored slice. Future ordinary CI may validate scenario syntax and local guardrail tests. Hosted capacity/fault runs must be a separate manual protected workflow with environment approval, finite timeout, one run per target and cleanup on cancellation; never automatically triggered by a pull request or a retrying schedule.

## Traceable acceptance gates

| Gate | Required proof |
|---|---|
| PM-AC-001 | Invalid, expired, unapproved or production-misdirected manifest is refused before load. Numeric ceilings include retries, fixture setup and asset traffic. |
| PM-AC-002 | The 500-session workload is actually offered/achieved under approved limits; browser sessions and sockets counted once; endpoint/stage SLOs meet 002A or a limitation is reported. |
| PM-AC-003 | Shared-IP arrival and retry latency are separately visible; 429s cannot disappear inside eventual success totals; real mailbox delivery is not implied. |
| PM-AC-004 | Real authenticated private-channel joins/broadcasts, polling fallback, expiration/refresh and reconnect are verified; protocol-only gaps are explicit. |
| PM-AC-005 | Zero unauthorized cross-event/role/contact reads and no private Cache Storage entries; no runtime service-role authorization. |
| PM-AC-006 | Exact intended/acknowledged/final ID reconciliation proves no lost or duplicate durable messages/posts under selected faults; read cursors remain monotonic. |
| PM-AC-007 | Rehearsed app rollback and separate DB/object restoration report actual recovery duration and recovery point; no unverified backup guarantees. |
| PM-AC-008 | Watchdog/cancel stops issuance, sockets close, cleanup is resumable, real event baseline is unchanged and synthetic remnants are zero. |
| PM-AC-009 | Final signed-off report identifies app/config/environment, source evidence, target and achieved workload, first-attempt and eventual outcomes, cost, redactions and blocked/skipped checks. |

## Report contract

Record `run_id`, UTC start/end, operator/approval reference, target identifiers, app and harness SHAs, migration fingerprint, effective-limit snapshot, scenario/seed, fixture manifest digest, planned and achieved users/RPS/sockets, generator health, per-endpoint/stage p50/p95/p99 and counts, raw 429/5xx/timeouts/retries, logical-action latency, message-to-badge measurements, fault windows, recovery timestamps, observed/estimated cost, final integrity audit and cleanup status.

Verdicts are independent: `capacity`, `resilience`, `recovery`, `account_email`, `physical_device`, `venue_network`. Each uses `pass`, `fail`, `blocked`, `inconclusive` or `not_tested`, with evidence paths. Do not use fabricated example numbers as results or overwrite historical JSON proof. The `qa/` directory remains without run evidence at authoring time.

## Ready to begin versus done

Ready to begin means the harness work is approved and the environmental/budget decisions are resolved; it does not mean a production test is approved. Done for Momentum Builder means the applicable acceptance gates and chosen 500-session operating profile have evidence, Jonathan has reviewed the remaining risks, the roster/email gates remain independently enforced, and all fixtures/faults are removed.

No product UI, data model, domain, billing setting, email sender or notification capability is changed by authoring this package.
