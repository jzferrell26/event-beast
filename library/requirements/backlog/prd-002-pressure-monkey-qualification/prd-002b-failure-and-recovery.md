# PRD-002B: Controlled failures and recovery rehearsal

> **Status:** Planned / not run. Use the [parent safety contract](./prd-002-pressure-monkey-qualification-index.md).
> Do not install infrastructure-termination tooling or use real attendees to inject failures.

## Experiment protocol

For each drill, write down a falsifiable hypothesis, the exact fixture identities and affected requests, a pre-fault healthy baseline, fault duration, stop rule and recovery observation. Start with one synthetic pair and one fault, then the approved small cohort, then only the separately approved reconnection wave. Run faults in an isolated environment or bounded test-client interception. Never tamper with the live provider/control plane.

Classify evidence as `client_simulated`, `isolated_dependency`, `hosted_normal` or `production_bounded`. Client interception proves client behavior; it does not prove that a provider/database outage was actually exercised. Keep healthy-control clients where possible so collateral degradation is observable.

| ID | Injection / hypothesis | Required evidence |
|---|---|---|
| PM-F01 | Test client loses connectivity for 30 seconds | Cached public reader remains available with saved timestamp; no offline send is marked successful; unsent draft remains; reconnect recovers accepted messages once |
| PM-F02 | Suppress only Realtime traffic for 2 minutes, keep HTTP healthy | Polling catches up without opening Inbox; badge/read state converges within the specified fallback budget; restoring sockets creates no duplicate subscription loop |
| PM-F03 | Discard response **after** a synthetic message/post has committed | Retry the identical idempotency key/body through the normal API; exactly one durable row exists; changed text with that key is refused; UI does not silently drop the draft |
| PM-F04 | Add 3-second latency and return 503 for 10% of selected test-client reads for 60 seconds | Existing content remains useful, failures are honest, bounded retries do not form a request storm, pending writes are not invented as successful |
| PM-F05 | Replay bounded synthetic 429 + Retry-After responses | Client obeys its documented retry behavior, does not busy-loop, and includes delays in action latency. Missing backoff is a defect, not permission to alter hosted quotas. |
| PM-F06 | Expire a test session or disable the synthetic Member while a page/channel is open | Next authoritative private read/write is refused; cached private UI state is cleared; public guide still works; roles cannot be recovered from user-editable metadata |
| PM-F07 | Synthetic peer blocks/unblocks or hides their profile | New sends and unread attention obey bidirectional blocks; hidden photos are no longer issued; private messages do not appear in the wall; unrelated Admins cannot browse unreported DMs |
| PM-F08 | Expired/failed signed test-photo URL, then a new authorized URL | Initials fallback does not break layout; renewal displays the image; no private bucket becomes public. Previously issued URLs have their actual short lifetime, not instant revocation. |
| PM-F09 | Reconnect 100, then separately approved 500 test sessions | Track HTTP/auth/channel joins and resulting backlog; reconcile every acknowledged test write without duplicates; bounded recovery, no growing reconnect loop |
| PM-F10 | Drop a synthetic organizer save/import response | UI retains uncertainty; fresh read/preview confirms durable state; repeated import is add-only; real roster and content are never in scope |
| PM-F11 | Controlled browser suspend/resume, keyboard open/close, orientation and stale app shell | Draft and view recover without blank-page scrolling; private state does not leak across sessions; old-to-new deployment behavior is checked in staging |

For PM-F01 on WebKit, reuse the existing isolated stopped-origin offline technique rather than declaring a known emulator artifact to be a product regression. For PM-F06, distinguish server revocation from browser background suspension: a suspended browser cannot promise immediate UI cleanup until it runs again.

A lost-response test must first prove the server committed, then interrupt only delivery to the test client. Randomly failing before commit does not test idempotent replay. During healthy retries and injected faults, maintain a ledger of intended keys, acknowledged IDs, rejected operations, final rows and last-read cursors. Reconcile exact sets rather than only comparing total counts.

## Recovery is a separate deliverable

Before experimenting, inventory the current recoverable artifacts without changing them: deployment SHA and rollback candidate, migration versions and compatibility, event settings, Auth/template configuration, secret **references**, database backup window, actual restore method, object inventory and an encrypted asset export location. Do not copy production secrets or personal data into Git or public artifacts.

A Vercel app rollback, a database restore and a Storage restore are different actions. Supabase's database backups contain Storage metadata, not the uploaded file bytes; a restored DB alone does not recover deleted image objects. Backup availability/retention and any point-in-time capability must be verified for the approved project before promising recovery. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).

| ID | Rehearsal | Proposed objective / gate |
|---|---|---|
| PM-R01 | Roll an isolated test deployment back to a known compatible application SHA | Usable public guide restored within 10 minutes of the declared decision time; no lost acknowledged DB writes; current migrations remain compatible |
| PM-R02 | Restore an isolated synthetic database snapshot into an approved disposable target | Measure full duration and actual recovery point. Proposed objective <= 60 minutes; never overwrite production to prove it. No event-data-loss promise without a demonstrated recovery point. |
| PM-R03 | Restore synthetic logos/ads/private headshots from an independent object copy | Verify hashes, MIME types, paths and public/private bucket policy; fresh signed photos work; no permanent signed URLs are stored as backup data |
| PM-R04 | Recover configuration after a staged broken release | Verify host/callback configuration, role-aware sign-in, RLS, message delivery and public guide; do not assume a database restore recreates SMTP, secrets or DNS |

For normal disconnect and app rollback, the proposed data-loss objective is **zero acknowledged writes**. For destructive database loss, set a numeric owner-approved recovery-point objective from the verified backup mechanism; it is **not yet known**. A daily snapshot cannot be described as minute-level protection. If the actual objective is unacceptable for the event, record a blocking risk and present an explicit capacity/backup decision; do not automatically purchase an add-on.

Include an operator tabletop: identify the faulty revision, stop new test traffic, preserve diagnostic evidence, select a schema-compatible rollback, verify the public guide, then verify a synthetic login/message/photo. Where an emergency read-only fallback is proposed, author and rehearse the exact behavior first; do not claim the existing offline reader is a universally preinstalled disaster fallback.

Measure timestamps for detection, decision, operation start, guide restoration and full service restoration separately. This avoids reporting a fast button click as total recovery time. The live domain and account-mail sender are not changed by the rehearsal.

## Cleanup and evidence

Fixtures carry a random run ID and exact ID/path manifest. After stopping, delete only those recorded synthetic objects/rows/identities in dependency order, verify zero remnants and preserve aggregate audit evidence. Prefix matching alone is insufficient authorization for deletion. A canceled process may not execute a normal teardown; a separate resumable cleanup command must validate target identity and run ownership before acting.

A passing fault run reports all injections, durations, affected counts, recovery latencies, controlled expected errors and unexpected effects. Record time-bounded photo access honestly. Use synthetic content in screenshots; redact cookies, bearer tokens, activation tokens, signed-URL query strings and contact data from reports and traces. A report must not expose the full private request payload to prove a count.

No automatic retry may launch a second fault experiment after an incomplete cleanup. “Could not reproduce” remains an open or bounded observation, not proof of recovery.
