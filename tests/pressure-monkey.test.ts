import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger, watchdogDecision } from '../scripts/pressure-monkey/budget.mjs';
import { validateApproval, verifyTargetEvidence, assertAllowedRequest, PRODUCTION_PROJECT, PRODUCTION_EVENT } from '../scripts/pressure-monkey/policy.mjs';
import { readPublicJson } from '../scripts/pressure-monkey/preflight.mjs';
import { localSelfTest } from '../scripts/pressure-monkey/watchdog.mjs';
import { spawnSync } from 'node:child_process';

const now = Date.parse('2026-10-01T00:00:00Z');
const limits = { max_active_sessions: 5, max_open_sockets: 5, max_http_requests_per_second: 10,
  max_total_http_attempts_including_retries: 100, max_writes_including_fixture_setup: 5, max_transfer_bytes: 10000,
  max_duration_seconds: 60, max_estimated_cost_usd: 1, max_fault_affected_sessions: 0, max_fault_duration_seconds: 0 };
function approval() {
  return { schema_version: 1, status: 'approved', run_id: '10000000-0000-4000-8000-000000000001', approved_by: 'Synthetic approver', approval_reference: 'unit-test-only',
    approved_at_utc: '2026-09-30T23:59:00Z', expires_at_utc: '2026-10-01T00:05:00Z', operator: 'unit test', rollback_owner: 'unit test',
    target: { environment: 'isolated', app_origin: 'https://event-test.example', deployment_id: 'synthetic-deployment', application_sha: 'a'.repeat(40), harness_sha: 'b'.repeat(40),
      supabase_project_ref: 'a'.repeat(20), event_id: '10000000-0000-4000-8000-000000000099', allowed_hosts: ['event-test.example', 'a'.repeat(20)+'.supabase.co'],
      allowed_paths: ['/api/guide', '/api/feed'], verified_isolated_from_production: true },
    permissions: { allow_production: false, allow_faults: false, allow_external_email: false, allow_paid_provisioning: false, allow_provider_or_dns_changes: false },
    profile: 'PM-L01', random_seed: 12, limits: { ...limits },
    preflight: { effective_provider_limits_evidence: 'synthetic-only', capacity_headroom_verified: true, safety_telemetry_verified: true,
      watchdog_verified: true, normal_auth_sessions_verified: true, rollback_compatibility_verified: true, fixture_manifest_reference: 'fixture-only', credentials_reference: 'secret-reference-not-a-key', cleanup_verified_locally: true } };
}
const valid = () => validateApproval(approval(), now).manifest!;
describe('Pressure Monkey manifest: refuse before traffic', () => {
  it('accepts a complete mechanical contract without authorizing a run', () => expect(validateApproval(approval(), now).valid).toBe(true));
  it.each(['approved_by', 'approval_reference', 'operator', 'rollback_owner', 'run_id'])('refuses missing %s', key => {
    const input = { ...approval(), [key]: null }; expect(validateApproval(input, now).valid).toBe(false);
  });
  it.each([null, -1, Infinity, NaN, '500'])('refuses invalid resource ceilings %s', value => {
    expect(validateApproval({ ...approval(), limits: { ...limits, max_active_sessions: value } }, now).valid).toBe(false);
  });
  it('rejects typos, unapproved/example status, stale approval, future approval and an overlong run', () => {
    for (const patch of [{ unknownForce: true }, { status: 'example_not_approved_not_executable' }, { expires_at_utc: '2026-09-30T00:00:00Z' }, { approved_at_utc: '2026-10-02T00:00:00Z' }, { expires_at_utc: '2026-10-01T00:00:01Z' }]) expect(validateApproval({ ...approval(), ...patch }, now).valid).toBe(false);
  });
  it.each(['https://event-beast.vercel.app', 'https://eventapp.momentumbuilder.com', 'https://2026live.momentumbuilder.com', 'https://event-beast-preview-cuantico.vercel.app'])('protects %s', app_origin => {
    const m = approval(); m.target.app_origin = app_origin; m.target.allowed_hosts = [new URL(app_origin).host]; expect(validateApproval(m, now).valid).toBe(false);
  });
  it('protects the backend and event even behind a different preview hostname', () => {
    const m = approval(); m.target.supabase_project_ref = PRODUCTION_PROJECT; expect(validateApproval(m, now).valid).toBe(false);
    const n = approval(); n.target.event_id = PRODUCTION_EVENT; expect(validateApproval(n, now).valid).toBe(false);
  });
  it('no force/production/email/provider-change flag bypasses this implementation', () => {
    for (const key of ['allow_production', 'allow_external_email', 'allow_paid_provisioning', 'allow_provider_or_dns_changes']) {
      const m = approval(); Object.assign(m.permissions, { [key]: true }); expect(validateApproval(m, now).valid).toBe(false);
    }
  });
  it('requires real isolation rather than treating localhost with the production database as local', () => {
    const m = approval(); m.target.environment = 'local'; m.target.app_origin = 'http://localhost:3100'; m.target.allowed_hosts = ['localhost:3100']; expect(validateApproval(m, now).valid).toBe(false);
  });
  it('rejects wildcards, external sponsor hosts, and undeclared fault allowances', () => {
    const m = approval(); m.target.allowed_paths = ['/api/*']; expect(validateApproval(m, now).valid).toBe(false);
    m.target.allowed_paths = ['/api/guide']; m.target.allowed_hosts.push('sponsor.example'); expect(validateApproval(m, now).valid).toBe(false);
    const n = approval(); n.limits.max_fault_affected_sessions = 1; expect(validateApproval(n, now).valid).toBe(false);
  });
  it.each(['https://event-test.example/api/feed/extra','https://event-test.example/api/%2e%2e/guide','https://event-test.example/api/x/../guide','https://event-test.example@elsewhere.example/api/guide','https://event-test.example/api/guide#token','https://sponsor.example/api/guide'])('rejects unexpected/ambiguous request %s', url => expect(() => assertAllowedRequest(valid(), url)).toThrow());
  it('only accepts declared read-only paths, never arbitrary writes', () => {
    expect(assertAllowedRequest(valid(), 'https://event-test.example/api/guide').pathname).toBe('/api/guide');
    expect(() => assertAllowedRequest(valid(), 'https://event-test.example/api/feed', 'POST')).toThrow('OPERATION_NOT_IMPLEMENTED');
  });
  it('checks independently supplied target evidence and 20% configured connection headroom', () => {
    const m = valid(); const evidence = { ...m.target, observed_at_utc: new Date(now).toISOString(), isolated_from_production: true, realtime_connection_limit: 500, existing_realtime_connections: 10 };
    expect(verifyTargetEvidence(m, evidence, now).usable).toBe(true);
    expect(() => verifyTargetEvidence(m, { ...evidence, supabase_project_ref: PRODUCTION_PROJECT }, now)).toThrow('TARGET_ATTESTATION_MISMATCH');
    expect(() => verifyTargetEvidence(m, evidence, now + 300001)).toThrow('STALE_OR_MISSING_TARGET_EVIDENCE');
    expect(() => verifyTargetEvidence({ ...m, limits: { ...m.limits, max_open_sockets: 500 } }, evidence, now)).toThrow('INSUFFICIENT_REALTIME_HEADROOM');
  });
});

describe('Pressure Monkey budgets count every attempt', () => {
  it('never creates an unbounded ledger or treats invalid watchdog telemetry as healthy', () => {
    expect(() => new BudgetLedger({ ...limits, max_duration_seconds: Infinity })).toThrow('INVALID_BUDGET');
    expect(() => new BudgetLedger({ ...limits, max_estimated_cost_usd: NaN })).toThrow('INVALID_BUDGET');
    expect(watchdogDecision({ now: 1000, started: 0, heartbeatAt: NaN, telemetryAt: 0, expiresAt: 5000, timeoutMs: 250, maxDurationMs: 3000, cancel: false })).toBe('INVALID_SAFETY_TELEMETRY');
  });
  it('reserves attempts/bytes/writes/cost and latches cancellation', () => {
    const ledger = new BudgetLedger(limits, { clock: () => now }); ledger.reserve({ bytes: 100, cost: 0.1, write: true });
    expect(ledger.snapshot()).toMatchObject({ attempts: 1, writes: 1, bytes: 100, cost: 0.1 });
    expect(() => ledger.stop()).toThrow('OPERATOR_CANCEL'); expect(() => ledger.reserve({ bytes: 0, cost: 0 })).toThrow('OPERATOR_CANCEL');
  });
  it.each([
    ['max_total_http_attempts_including_retries', 1, 'ATTEMPT_LIMIT'], ['max_http_requests_per_second', 1, 'RATE_LIMIT'],
    ['max_writes_including_fixture_setup', 1, 'WRITE_LIMIT'], ['max_transfer_bytes', 100, 'TRANSFER_LIMIT'], ['max_estimated_cost_usd', 0.1, 'COST_LIMIT'],
  ])('stops before crossing %s', (key, value, code) => {
    const ledger = new BudgetLedger({ ...limits, [key]: value }, { clock: () => now });
    ledger.reserve({ bytes: 100, cost: 0.1, write: true });
    expect(() => ledger.reserve({ bytes: 100, cost: 0.1, write: true })).toThrow(String(code)); expect(ledger.snapshot().attempts).toBe(1);
  });
  it('limits sessions and sockets including additional tabs', () => {
    const ledger = new BudgetLedger({ ...limits, max_active_sessions: 1 }); ledger.acquire('sessions'); expect(() => ledger.acquire('sessions')).toThrow('SESSION_LIMIT');
    const sockets = new BudgetLedger({ ...limits, max_open_sockets: 0 }); expect(() => sockets.acquire('sockets')).toThrow('SOCKET_LIMIT');
  });
  it('rolls the RPS window and rejects invalid reservations, expiry and duration', () => {
    let clock = now; const ledger = new BudgetLedger({ ...limits, max_http_requests_per_second: 1 }, { clock: () => clock });
    ledger.reserve({ bytes: 10, cost: 0 }); clock += 1000; ledger.reserve({ bytes: 10, cost: 0 }); expect(ledger.snapshot().attempts).toBe(2);
    expect(() => ledger.reserve({ bytes: -1, cost: 0 })).toThrow('INVALID_RESERVATION');
    const expired = new BudgetLedger(limits, { clock: () => clock, expiresAt: clock }); expect(() => expired.checkTime()).toThrow('APPROVAL_EXPIRED');
    const timed = new BudgetLedger(limits, { clock: () => clock }); clock += 60000; expect(() => timed.checkTime()).toThrow('DURATION_LIMIT');
  });
  it('independent monitor distinguishes scheduler stalls, stale telemetry and expiry', () => {
    const base = { now: 1000, started: 0, heartbeatAt: 950, telemetryAt: 950, expiresAt: 5000, timeoutMs: 250, maxDurationMs: 3000, cancel: false };
    expect(watchdogDecision(base)).toBeNull(); expect(watchdogDecision({ ...base, heartbeatAt: 0 })).toBe('SCHEDULER_UNRESPONSIVE');
    expect(watchdogDecision({ ...base, telemetryAt: 0 })).toBe('STALE_SAFETY_TELEMETRY'); expect(watchdogDecision({ ...base, cancel: true })).toBe('OPERATOR_CANCEL');
  });
});

describe('Read-only public inspection', () => {
  it('does not follow redirects and never issues a second request', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 307, headers: { location: 'https://event-beast.vercel.app/api/guide' } }));
    await expect(readPublicJson('https://eventapp.momentumbuilder.com/api/guide', { fetcher })).rejects.toThrow('UNVERIFIED_REDIRECT_REFUSED');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledWith('https://eventapp.momentumbuilder.com/api/guide', expect.objectContaining({ redirect: 'manual', credentials: 'omit' }));
  });
  it('refuses login HTML, oversized data and unapproved endpoints', async () => {
    await expect(readPublicJson('https://event-beast.vercel.app/api/guide', { fetcher: async () => new Response('<html>Login</html>') })).rejects.toThrow('PUBLIC_ENDPOINT_UNAVAILABLE');
    await expect(readPublicJson('https://event-beast.vercel.app/api/guide', { maxBytes: 5, fetcher: async () => new Response(JSON.stringify({ too: 'large' }), { headers: { 'content-type': 'application/json' } }) })).rejects.toThrow('PUBLIC_RESPONSE_TOO_LARGE');
    await expect(readPublicJson('https://sponsor.example/api/guide')).rejects.toThrow('PUBLIC_INSPECTION_NOT_ALLOWLISTED');
  });
  it('rejects the inert example through the actual CLI without starting traffic', () => {
    const result = spawnSync(process.execPath, ['scripts/pressure-monkey/cli.mjs', 'run', 'library/requirements/in-work/prd-002-pressure-monkey-qualification/run-approval.example.json'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ valid: false, traffic_started: false });
    expect(report.issues.some((issue: { path: string }) => issue.path === 'status')).toBe(true);
  });
});

it('runs all local stop-control drills and reaps every child without app/provider traffic', async () => {
  const report = await localSelfTest(); expect(report.passed).toBe(true); expect(report.checks).toHaveLength(7);
  expect(report.checks.every(check => check.childExited && check.networkRequests === 0)).toBe(true);
  expect(report.verdicts.capacity).toBe('not_tested');
}, 20000);
