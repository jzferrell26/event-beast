# PRD-002A: Capacity and realistic workload

> **Status:** Planned. All profiles, ceilings and performance targets below are proposed acceptance criteria, not measured results or vendor guarantees.
> Parent: [PRD-002](./prd-002-pressure-monkey-qualification-index.md).

## Test the app we actually ship

Use k6 for most HTTP traffic and a small, reused Playwright browser pool for visible behavior. Use a protocol-accurate Realtime driver with distinct synthetic user tokens, subscriptions, heartbeat, token refresh, rejoin and cleanup. A bare WebSocket connection or HTTP-only test does not prove private-channel delivery. Keep the current browser/client SDK as the reference; compare protocol behavior against browser captures before accepting the driver. [Hybrid testing reference](https://grafana.com/docs/k6/latest/testing-guides/load-testing-websites/).

The measured path is browser-equivalent app requests through Vercel, then normal Supabase authorization. Direct database benchmarks are diagnostic and must be labeled separately. Correlate the authenticated cookie/session per synthetic user; do not silently follow a redirect to a 200 login page and count it as successful access. Requests must assert expected content/JSON and role identity, not only HTTP status.

Pin tool versions during implementation, not speculative version numbers in this PRD. No paid cloud runner is required by the design. Monitor generator CPU, memory, open sockets, event-loop delay and achieved request rate; an overloaded generator invalidates the capacity inference.

## Current workload amplification to reproduce

The inspected source at the parent SHA contains these behaviors:

| Source | Behavior to retain in the simulation |
|---|---|
| `src/components/realtime.tsx`, `message-attention.tsx` | One shared private channel per mounted eligible app shell; visible/online reconciliation every 20 seconds, plus focus/reconnect and invalidation |
| `src/components/feed.tsx` | Visible wall refresh every 30 seconds and focus; pagination, author-image signing, occasional writes |
| `src/components/app-provider.tsx` | Visible guide refresh every 60 seconds; identity/guide work on focus/online; public bookmarks are device-local |
| `src/lib/server/avatar-urls.ts` | Per-request RLS-protected author lookup and batched signed photo URLs with 120-second expiry |
| `public/sw.js` | Public reader/guide caching and up to 60 admitted public-image fetches per guide-image refresh |

As a **derived planning estimate**, 500 visible signed-in sessions all on the wall can generate about `500/20 + 500/30 + 500/60 = 50` application polling requests/second, before navigation, message-triggered refreshes, identity work, assets and database/Storage fan-out. This is not a measured RPS or an assertion that every timer always produces an origin request. Capture actual headers/cache behavior and request counts; do not optimize the test's traffic below what the shipping app generates.

Record visible versus background behavior, cold/warm asset loads and service-worker-controlled versus fresh browsers. Do not repeatedly append cache-busting parameters, fetch offsite sponsor destinations, or disable production caches to create artificial load. Measure real cookie/cache semantics and avoid counting private API responses as cacheable.

## Cohort and traffic mix

Prepare 500 unique synthetic identities and registrations in the approved isolated environment, each with independent sessions. Profiles start private; a declared subset opts in through normal APIs. Seed realistic but synthetic post/message history sufficient to exercise multiple pages and more than 30 conversations for a small subset. Seed no more than 10,000 messages, 1,000 posts and 500 small synthetic headshots in the initial fixture; these counts are proposed ceilings included in the budget manifest.

The standard profile's primary activities are: 60% information browsing, 25% wall reading, 10% private conversations and 5% profile/directory work. Within the same total, reserve five identities for assigned Sponsor/Admin canaries; they are not additional uncounted sessions. Mix targets are adjustable assumptions and must be recorded before a run.

Vary reading/navigation think times between 10 and 30 seconds. For the conversation subset, initially model at most two new messages per minute per user. Only 20% of wall readers post, at most once per five minutes. Other wall users read/page rather than continually publish. Model the real background timers independently of those think times. Fetch each route's actual first-load dependencies and appropriately cached images. Repeated sends retain the original idempotency key; new intentions get new keys.

Browser canaries occupy identities already counted in the stage, replacing protocol sessions instead of adding invisible load. Use at most two browser processes; run phone Chromium and WebKit observations in bounded contexts. Separately validate a small session set across two tabs to measure actual channel multiplicity. A proposed 550-session staff/extra-tab margin run is optional and isolated-only, never an automatic extension of the 500-session run.

## Execution profiles — separate, never one uncontrolled marathon

| ID | Proposed profile | Purpose and gate |
|---|---|---|
| PM-L01 | 5 users for 3 minutes | Validate targets, cookies, assertions, observers, accounting, cleanup and stop controls |
| PM-L02 | 25, 100, 250, then 500 active sessions; 2-minute transitions and 5-minute holds | Scale only after each lower stage is healthy; approximately 30 minutes total |
| PM-L03 | 500 distinct first arrivals over 60 seconds, then 10-minute hold | Separately measure first-page, sign-in/claim and app-usable time; no email during capacity traffic |
| PM-L04 | Approved 500-session mixed workload for 45 minutes, 5-minute ramp and recovery tail | Latency drift, leaks, token/photo renewal, background traffic and database/resource accumulation |
| PM-L05 | 500 wall viewers for 10 minutes, within the same ceilings | Worst declared read-heavy polling/photo pattern, not 500 continuous posters |
| PM-L06 | 100 test sockets disconnected for 30 seconds, later up to 500 only if approved | Rejoin waves with and without modeled client jitter; no provider shutdown |
| PM-L07 | Optional 550-session margin hold for 5 minutes | Staff/second-tab headroom only after preflight allows it; omit without approval |

Do not execute all profiles in ordinary CI. Select a profile and a separately approved request/byte/cost budget each time. Stop rather than increase automatically when a cap is reached.

For sustained active sessions, use a closed/session-based workload. For arrival rate, schedule attempts independently of response time so slowing servers do not artificially reduce offered load; cap allocated users and report offered, started, completed and dropped work. One iteration is not necessarily one HTTP request or one active user. [k6 open/closed model reference](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/).

Run login/claim traffic first at a staged approved rate. A 500-in-one-second auth experiment is a separately approved stress profile, not normal arrival. Include a one-egress-IP/shared-NAT scenario because it is relevant to event Wi-Fi; do not spoof forwarding headers or distribute IPs to evade provider limits. Multi-egress diagnostics must be labeled and cannot replace that shared-network result. Actual onsite network behavior requires a physical test.

## Effective-capacity preflight

Inspect read-only settings for the **actual target**, not a plan name in memory: Auth endpoint/IP/project limits, email quotas, Realtime connections/joins/messages, database compute and connection pooling, Vercel concurrency/timeouts/region, storage bandwidth and request limits, provider terms and spend controls. Supabase documents configurable project Realtime limits and a 500-connection capped Pro default, but this does not establish the current Event Beast allowance. [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Auth limits](https://supabase.com/docs/guides/auth/rate-limits).

Proposed gate: configured connection capacity must exceed the projected socket total by at least 20%, including observed existing connections, staff and extra tabs. At a true 500-connection cap, a 500-socket experiment fails this gate; request a capacity decision or explicitly change the operating profile. Never silently remove spending protections. Count socket joins and messages independently from connections and application HTTP requests. Preserve at least 20% measured resource headroom in steady load or document a blocking capacity finding.

## Proposed performance and integrity acceptance

Evaluate per endpoint group **and per stage**, with p50/p95/p99, sample counts and distributions. No overall average may hide a slow private route. Count every 429, timeout and retry attempt; also measure end-to-end logical-action latency through retries. Intended denial tests and deliberately injected faults are separately tagged, but unexpected auth failures remain failures.

| Metric, under normal declared workload | Proposed target |
|---|---|
| Public guide and ordinary private reads | p95 <= 1.5 seconds; p99 <= 3 seconds |
| Message/post acknowledgment after durable commit | p95 <= 2 seconds; p99 <= 5 seconds |
| Sign-in through usable role destination, including retries | p95 <= 5 seconds; p99 <= 10 seconds; no unresolved users |
| Unexpected 5xx/network failures or 429s | Each < 1% per critical route/stage; report retries, never hide them |
| Healthy Realtime commit-to-peer update / unread indicator | p95 <= 3 seconds; p99 <= 5 seconds |
| Poll-only message/read reconciliation | p95 <= 25 seconds after healthy connectivity resumes; every accepted message recovered within 60 seconds |
| Visible wall polling (no manual refresh) | p95 <= 35 seconds for a new visible post |
| First usable public screen in browser canaries | p95 <= 3 seconds on the recorded baseline network; slowed-network runs reported separately |
| Run-wide integrity and isolation | Zero missing acknowledged writes, duplicate durable writes or unauthorized reads/writes |

All values are proposed targets for review, not statements that the current release meets them. Insufficient samples, dropped scheduled work, stale telemetry or absent transport verification produce `inconclusive`/`blocked`, not a pass. Measure token renewal separately if the configured session lifetime exceeds the soak; a 45-minute test must not claim it exercised an unexpired long-lived token.

Use k6 thresholds with nonzero exit on breach, plus the parent's independent watchdog and rolling-window checks. Aggregate k6 thresholds alone are not a rolling-window monitor. [Thresholds reference](https://grafana.com/docs/k6/latest/using-k6/thresholds/).
