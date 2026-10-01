import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { watchdogDecision } from './budget.mjs';

const modes = new Set(['normal', 'attempt-limit', 'stalled', 'stale-telemetry', 'cancel', 'ignore-stop', 'expiry']);

/** A separate OS process runs the fixed local canary; no hosted runner is wired.
 * The supervisor's deadline still runs when the scheduler event loop stalls. */
export function rehearseWatchdog(mode) {
  if (!modes.has(mode)) throw new Error('UNKNOWN_LOCAL_REHEARSAL');
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./local-canary.mjs', import.meta.url)), [], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [],
      // Do not forward API keys, cookies, NODE_OPTIONS or production environment.
      env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    });
    const limits = { max_active_sessions: 1, max_open_sockets: 0, max_http_requests_per_second: 100,
      max_total_http_attempts_including_retries: mode === 'attempt-limit' ? 2 : 1000,
      max_writes_including_fixture_setup: 0, max_transfer_bytes: 1000000, max_duration_seconds: 3, max_estimated_cost_usd: 0 };
    let started = 0, heartbeatAt = 0, telemetryAt = 0, code = null, forced = false, last = null, killTimer;
    const finish = reason => {
      if (code) return;
      code = reason;
      if (child.connected) child.send({ type: 'stop', mode }, () => {});
      killTimer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, 200);
    };
    const deadline = setTimeout(() => finish('LOCAL_REHEARSAL_TIMEOUT'), 6000);
    const monitor = setInterval(() => {
      if (!started || code) return;
      const now = Date.now();
      const decision = watchdogDecision({ now, started, heartbeatAt, telemetryAt,
        expiresAt: mode === 'expiry' ? started + 250 : started + 4000, timeoutMs: 250, maxDurationMs: 3000,
        cancel: ['cancel', 'ignore-stop'].includes(mode) && now - started >= 160 });
      if (decision) finish(decision);
    }, 25);
    child.on('message', message => {
      if (code) return;
      if (message.type === 'ready') { started = Date.now(); heartbeatAt = started; telemetryAt = started; }
      if (message.type === 'heartbeat') { heartbeatAt = Date.now(); if (message.safetyFresh) telemetryAt = heartbeatAt; last = message.metrics; }
      if (message.type === 'done') { last = message.metrics; finish('COMPLETED'); }
      if (message.type === 'stopped') { last = message.metrics; finish(message.code); }
    });
    const cleanup = () => { clearInterval(monitor); clearTimeout(deadline); clearTimeout(killTimer); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', () => {
      cleanup();
      resolve({ mode, outcome: code ?? 'UNEXPECTED_CHILD_EXIT', forcedTermination: forced, childExited: true,
        simulatedAccounting: last, networkRequests: 0, databaseWrites: 0, emailsSent: 0,
        elapsedMs: started ? Date.now() - started : 0 });
    });
    child.send({ type: 'start', mode, limits });
  });
}

export async function localSelfTest() {
  const expected = { normal: 'COMPLETED', 'attempt-limit': 'ATTEMPT_LIMIT', stalled: 'SCHEDULER_UNRESPONSIVE',
    'stale-telemetry': 'STALE_SAFETY_TELEMETRY', cancel: 'OPERATOR_CANCEL', 'ignore-stop': 'OPERATOR_CANCEL', expiry: 'APPROVAL_EXPIRED' };
  const checks = [];
  for (const [mode, outcome] of Object.entries(expected)) {
    const result = await rehearseWatchdog(mode);
    const passed = result.outcome === outcome && result.childExited && (!['stalled', 'ignore-stop'].includes(mode) || result.forcedTermination);
    checks.push({ ...result, expected: outcome, passed });
  }
  return { schema_version: 1, kind: 'local_ipc_only_stop_control_rehearsal', checked_at_utc: new Date().toISOString(),
    passed: checks.every(check => check.passed), checks, hostedTrafficGenerated: false,
    verdicts: { capacity: 'not_tested', resilience: 'not_tested', recovery: 'not_tested', account_email: 'not_tested' } };
}
