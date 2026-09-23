import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const PROJECT_REF = 'nyhzmazbfctuttizwnxp';
export const EVENT_ID = 'a9bdf080-f47f-538e-94f7-38e4ff996116';
export function cli(args, { input, timeout = 120000 } = {}) {
  // Controlled tokens only. Put SQL, multiline bodies and secrets in files or
  // stdin; this avoids Windows cmd.exe interpreting quoted npx package names.
  if (args.some(arg => typeof arg !== 'string' || /[\s"&|<>%`]/.test(arg))) throw new Error('Unsafe CLI argument');
  const windows = process.platform === 'win32';
  const command = args.join(' ');
  const result = spawnSync(windows ? process.env.ComSpec || 'cmd.exe' : 'npx', windows ? ['/d', '/s', '/c', `npx.cmd ${command}`] : args, { cwd: process.cwd(), input, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
  if (result.status !== 0 || result.error) {
    mkdirSync('supabase/.temp', { recursive: true });
    writeFileSync('supabase/.temp/last-command-private.log', `${result.stderr || ''}\n${result.stdout || ''}`);
    throw new Error(`CLI failed (exit ${result.status ?? 'unknown'}). Details retained only in the ignored private command log.`);
  }
  return result.stdout;
}
export function query(sql) {
  mkdirSync('supabase/.temp', { recursive: true });
  const file = `supabase/.temp/controlled-query-${randomUUID()}.sql`;
  writeFileSync(file, sql, 'utf8');
  const raw = cli(['supabase', 'db', 'query', '--linked', '--project-ref', PROJECT_REF, '--file', file, '--output', 'json']);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed;
}
export function backendEnvironment() {
  const env = Object.fromEntries(readFileSync('.env.backend.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${PROJECT_REF}.supabase.co`) throw new Error('This operation must use the dedicated Event Beast project.');
  return env;
}
export function backendAdmin() {
  const env = backendEnvironment();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.EVENT_BEAST_QUALIFICATION_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raw = cli(['supabase', 'projects', 'api-keys', '--project-ref', PROJECT_REF, '--reveal', '--output', 'json']);
  const parsed = JSON.parse(raw);
  const keys = Array.isArray(parsed) ? parsed : parsed.api_keys ?? parsed.keys ?? [];
  const publishable = keys.find(key => key.type === 'publishable') ?? keys.find(key => key.name === 'anon');
  const admin = keys.find(key => key.type === 'secret') ?? keys.find(key => key.name === 'service_role');
  if (!publishable?.api_key || !admin?.api_key) throw new Error('Expected project API keys were not returned. No key values were printed.');
  writeFileSync('.env.backend.local', `NEXT_PUBLIC_SUPABASE_URL=https://${PROJECT_REF}.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable.api_key}\nEVENT_BEAST_QUALIFICATION_SERVICE_KEY=${admin.api_key}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ project: PROJECT_REF, publishableConfigured: true, testAdminKeyStoredPrivately: true, runtimeRequiresServiceKey: false }));
}
