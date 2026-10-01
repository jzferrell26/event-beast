import { SafetyError } from './policy.mjs';

/** Reserve worst-case transfer/cost BEFORE an attempt; count retries and fixture
 * setup too. Never refund a lost response, timeout or failed request. */
export class BudgetLedger {
  constructor(limits, { clock = Date.now, expiresAt = Infinity } = {}) {
    const integral = ['max_active_sessions','max_open_sockets','max_http_requests_per_second','max_total_http_attempts_including_retries','max_writes_including_fixture_setup','max_transfer_bytes','max_duration_seconds'];
    if (!limits || integral.some(key => !Number.isSafeInteger(limits[key]) || limits[key] < 0)
      || ['max_active_sessions','max_http_requests_per_second','max_total_http_attempts_including_retries','max_transfer_bytes','max_duration_seconds'].some(key => limits[key] === 0)
      || !Number.isFinite(limits.max_estimated_cost_usd) || limits.max_estimated_cost_usd < 0) throw new SafetyError('INVALID_BUDGET');
    this.limits = limits; this.clock = clock; this.started = clock(); this.expiresAt = expiresAt;
    this.attempts = 0; this.writes = 0; this.bytes = 0; this.cost = 0;
    this.sessions = 0; this.sockets = 0; this.recent = []; this.stopped = null;
  }
  stop(code = 'OPERATOR_CANCEL') { this.stopped ??= code; throw new SafetyError(this.stopped); }
  checkTime() {
    if (this.stopped) this.stop(this.stopped);
    if (this.clock() >= this.expiresAt) this.stop('APPROVAL_EXPIRED');
    if (this.clock() - this.started >= this.limits.max_duration_seconds * 1000) this.stop('DURATION_LIMIT');
  }
  reserve({ bytes, cost, write = false }) {
    this.checkTime();
    if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isFinite(cost) || cost < 0 || typeof write !== 'boolean') this.stop('INVALID_RESERVATION');
    const now = this.clock();
    this.recent = this.recent.filter(at => at > now - 1000);
    const checks = [
      [this.recent.length + 1 <= this.limits.max_http_requests_per_second, 'RATE_LIMIT'],
      [this.attempts + 1 <= this.limits.max_total_http_attempts_including_retries, 'ATTEMPT_LIMIT'],
      [this.writes + Number(write) <= this.limits.max_writes_including_fixture_setup, 'WRITE_LIMIT'],
      [this.bytes + bytes <= this.limits.max_transfer_bytes, 'TRANSFER_LIMIT'],
      [this.cost + cost <= this.limits.max_estimated_cost_usd, 'COST_LIMIT'],
    ];
    for (const [ok, code] of checks) if (!ok) this.stop(code);
    this.recent.push(now); this.attempts++; this.writes += Number(write); this.bytes += bytes; this.cost += cost;
  }
  acquire(kind) {
    this.checkTime();
    if (!['sessions', 'sockets'].includes(kind)) this.stop('INVALID_RESOURCE');
    const limit = kind === 'sessions' ? this.limits.max_active_sessions : this.limits.max_open_sockets;
    if (this[kind] + 1 > limit) this.stop(kind === 'sessions' ? 'SESSION_LIMIT' : 'SOCKET_LIMIT');
    this[kind]++;
  }
  release(kind) { if (!['sessions', 'sockets'].includes(kind) || this[kind] <= 0) this.stop('INVALID_RELEASE'); this[kind]--; }
  snapshot() { return { attempts: this.attempts, writes: this.writes, bytes: this.bytes, cost: this.cost, sessions: this.sessions, sockets: this.sockets, stopped: this.stopped }; }
}

/** Evaluated by the supervisor, never the busy load scheduler. */
export function watchdogDecision({ now, started, heartbeatAt, telemetryAt, expiresAt, timeoutMs, maxDurationMs, cancel }) {
  if (![now, started, heartbeatAt, telemetryAt, expiresAt, timeoutMs, maxDurationMs].every(Number.isFinite)
    || started > now || heartbeatAt > now || telemetryAt > now || timeoutMs <= 0 || maxDurationMs <= 0 || typeof cancel !== 'boolean') return 'INVALID_SAFETY_TELEMETRY';
  if (cancel) return 'OPERATOR_CANCEL';
  if (now >= expiresAt) return 'APPROVAL_EXPIRED';
  if (now - started >= maxDurationMs) return 'DURATION_LIMIT';
  if (now - heartbeatAt > timeoutMs) return 'SCHEDULER_UNRESPONSIVE';
  if (now - telemetryAt > timeoutMs) return 'STALE_SAFETY_TELEMETRY';
  return null;
}
