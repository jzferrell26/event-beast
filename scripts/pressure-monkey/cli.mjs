import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateApproval, verifyTargetEvidence, SafetyError } from './policy.mjs';
import { preflight } from './preflight.mjs';
import { localSelfTest } from './watchdog.mjs';

async function loadJson(path) {
  const data = await readFile(path);
  if (data.length > 1048576) throw new SafetyError('INPUT_EXCEEDS_1_MB');
  return JSON.parse(data.toString('utf8'));
}
async function saveReport(kind, report) {
  const folder = 'test-results/pressure-monkey';
  await mkdir(folder, { recursive: true });
  const path = `${folder}/${kind}-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`;
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...report, report_path: path }, null, 2));
}
const [command = 'preflight', ...args] = process.argv.slice(2);
try {
  if (command === 'preflight') {
    if (args.length > 1 || args.some(arg => arg !== '--inspect-public')) throw new SafetyError('UNKNOWN_ARGUMENT');
    await saveReport('preflight', await preflight({ inspectPublic: args.includes('--inspect-public') }));
  } else if (command === 'self-test') {
    if (args.length) throw new SafetyError('UNKNOWN_ARGUMENT');
    const report = await localSelfTest(); await saveReport('local-stop-controls', report);
    if (!report.passed) process.exitCode = 1;
  } else if (['validate', 'dry-run', 'run'].includes(command)) {
    if (![1, 3].includes(args.length) || (args.length === 3 && args[1] !== '--evidence')) throw new SafetyError('MANIFEST_AND_OPTIONAL_EVIDENCE_REQUIRED');
    const result = validateApproval(await loadJson(args[0]));
    if (!result.valid) {
      await saveReport('manifest-review', { schema_version: 1, valid: false, issues: result.issues, traffic_started: false });
      process.exitCode = 2;
    } else {
      const target = args.length === 3 ? verifyTargetEvidence(result.manifest, await loadJson(args[2])) : null;
      await saveReport('manifest-review', { schema_version: 1, valid: true, run_id: result.manifest.run_id,
        target_evidence_verified: Boolean(target), required_connection_limit: target?.requiredConnectionLimit ?? null,
        authorization_independently_confirmed: false, traffic_started: false, execution_ready: false,
        reason: 'HOSTED_RUNNER_AND_FIXTURE_ADAPTERS_NOT_ENABLED' });
      if (command === 'run') process.exitCode = 2;
    }
  } else if (['prepare', 'abort', 'audit', 'cleanup'].includes(command)) {
    throw new SafetyError('HOSTED_LIFECYCLE_NOT_IMPLEMENTED_NO_ACTION_TAKEN');
  } else throw new SafetyError('UNKNOWN_COMMAND');
} catch (error) {
  // Input or provider errors may contain credentials. Report fixed codes only.
  console.error(JSON.stringify({ refused: true, code: error instanceof SafetyError ? error.code : 'INPUT_OR_PREFLIGHT_ERROR', traffic_started: false }));
  process.exitCode = 2;
}
