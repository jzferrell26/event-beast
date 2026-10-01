import { BudgetLedger } from './budget.mjs';

// IPC-only local scheduler. No app, provider, filesystem writes, fetch, sockets
// or fixture identities. Deliberately fixed actions: never executes a command
// taken from a manifest. The supervisor owns and terminates this exact child.
let started = false, timer;
process.on('message', message => {
  if (message.type === 'stop') {
    if (message.mode !== 'ignore-stop') { clearInterval(timer); process.exit(0); }
    return;
  }
  if (message.type !== 'start' || started) return;
  started = true;
  const { mode, limits } = message;
  const ledger = new BudgetLedger(limits);
  let count = 0;
  process.send?.({ type: 'ready' });
  timer = setInterval(() => {
    if (mode === 'stalled' && count === 2) {
      // Block this child without burning a CPU. Parent must still stop it.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
    try {
      ledger.reserve({ bytes: 100, cost: 0 }); count++;
      process.send?.({ type: 'heartbeat', safetyFresh: mode !== 'stale-telemetry', metrics: ledger.snapshot() });
      if (mode === 'normal' && count === 5) { clearInterval(timer); process.send?.({ type: 'done', metrics: ledger.snapshot() }); }
    } catch (error) { clearInterval(timer); process.send?.({ type: 'stopped', code: error.code ?? 'CANARY_FAILURE', metrics: ledger.snapshot() }); }
  }, 30);
});
process.on('disconnect', () => process.exit(0));
