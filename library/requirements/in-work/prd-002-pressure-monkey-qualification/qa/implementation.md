# First implementation slice: local safety controls

## Scope and result

Validated October 1, 2026 UTC (September 30 Central time). The implementation adds read-only preflight, mechanical manifest/target validation, budget primitives, and a separate-process local stop-control rehearsal. It refreshes the repository overview and moves PRD-002 into in-work. No application source, production schema, provider configuration, or browser behavior is changed.

`npm run check` passed lint, TypeScript, **286 tests in 37 files**, and the production build. Of these, **42 tests** cover Pressure Monkey guards and **10 tests** cover README/documentation links and commands. Existing authorization/database/domain tests remain included.

`npm run pressure:self-test` passed all seven local IPC-only drills: normal completion, total-attempt stop, unresponsive scheduler, stale safety telemetry, operator cancel, ignored stop with forced termination, and approval expiry. Every owned child exited. Those drills generated zero app/provider HTTP requests, database writes, or email.

`npm run pressure:preflight -- --inspect-public` performed exactly four credential-free GETs: release and public guide on each existing alias. Both reported the same live revision (`869d9120bbfc8ee89436e9d003516b0475b7b589`), 49 public agenda entries, 37 sponsor-tier records, community enabled and account email gated. The report contains only selected public facts and source fingerprints. This is a point-in-time read, not a throughput benchmark.

Raw local reports are timestamped under ignored `test-results/pressure-monkey/`. The initial preflight explicitly records a dirty working tree because it was executed during implementation; it is not an immutable deployed-harness result. Independent CI and merge evidence must be recorded with the eventual PR rather than retroactively changing that timestamp.

## Acceptance boundaries

The inert example was rejected by the actual CLI before traffic. Tests cover missing approval, non-finite budgets, protected domains/project/event, a production backend disguised behind a different preview hostname, unapproved third-party hosts, ambiguous paths, no redirect following, no unexpected writes, freshness/headroom checks and bounded public response size.

**Not qualified:** PM-AC-002 through PM-AC-009 as complete hosted gates, the full fixture lifecycle, k6/Realtime workload drivers, provider telemetry/rolling windows, actual socket cleanup under load, 500 simultaneous users, email delivery, restore RTO/RPO, physical phones or venue networking. PM-AC-001 has local guard evidence only. PM-001 still needs an approved isolated target and effective quota inventory; PM-002 still needs hosted integration.

No production stress, paid resource, provider fault, restore or attendee invitation was executed. Local process cancellation is not presented as hosted data recovery.
