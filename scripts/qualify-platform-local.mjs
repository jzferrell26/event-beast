/** Rehearse the real customer workflow against freshly reset loopback services.
 * Privileged credentials are confined to local fixture creation, never the app.
 * Run: node scripts/qualify-platform-local.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function localUrl(value, protocol, port) {
  const url = new URL(value);
  if (url.protocol !== protocol || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== port) {
    throw new Error('Platform qualification requires the configured local Supabase ports.');
  }
  return url;
}
function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw new Error(`Local qualification command failed: ${command}`);
}

async function main() {
  // Capture output: status includes local-only secrets and must not be logged.
  const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.121.0', 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const api = localUrl(status.API_URL, 'http:', '54361');
  const database = localUrl(status.DB_URL, 'postgresql:', '54362');
  if (database.pathname !== '/postgres' || database.username !== 'postgres' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Unexpected local fixture configuration.');
  const password = `Local-only-${randomBytes(24).toString('hex')}`;
  const client = createClient(api.origin, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const actors = ['agency', 'alpha', 'beta'];
  const ids = {};
  for (const actor of actors) {
    const { data, error } = await client.auth.admin.createUser({ email: `${actor}@platform.example.test`, password, email_confirm: true });
    if (error || !data.user) throw new Error(`Create ${actor} fixture failed. Reset the isolated database before this run.`);
    ids[actor] = data.user.id;
  }
  if (!/^[0-9a-f-]{36}$/.test(ids.agency)) throw new Error('Invalid fixture identity.');
  // No shell interpolation. Only the generated, validated local fixture UUID is
  // inserted; an existing agency grant is never replaced by the qualification.
  execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', database.hostname, '-p', database.port, '-U', database.username, '-d', 'postgres'], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(database.password) },
    input: `insert into private.platform_owner(user_id) values ('${ids.agency}'::uuid);`,
  });
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/SUPABASE|DATABASE_URL|PLAYWRIGHT_BASE_URL|EVENT_BEAST_/.test(key)) delete env[key];
  }
  Object.assign(env, {
    EVENT_BEAST_PLATFORM_ENABLED: 'true', EVENT_BEAST_DEMO_MODE: 'false', EVENT_BEAST_PUBLIC_SITE: 'true',
    EVENT_BEAST_EMAIL_READY: 'false', EVENT_BEAST_RECOVERY_READY: 'false',
    EVENT_BEAST_PLATFORM_URL: 'http://127.0.0.1:3190', EVENT_BEAST_SITE_URL: 'http://127.0.0.1:3190',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3190', NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, PLATFORM_TEST_PASSWORD: password,
  });
  console.log('Created three confirmed synthetic users in isolated loopback Supabase.');
  run('npm', ['run', 'build'], env);
  run('node', ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.platform.config.ts'], env);
}
main().catch(() => { console.error('Platform qualification failed. Inspect the preceding build/test output or reset the isolated fixtures. No production target is supported.'); process.exitCode = 1; });
