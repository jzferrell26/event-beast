import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SafetyError, PRODUCTION_PROJECT, PRODUCTION_EVENT } from './policy.mjs';

export const PUBLIC_ORIGINS = ['https://2026live.momentumbuilder.com', 'https://eventapp.momentumbuilder.com', 'https://event-beast.vercel.app'];
const digest = content => createHash('sha256').update(content).digest('hex');

/** At most one credential-free GET per exact public endpoint. Redirects are
 * reported, never followed; no images, links or authentication flows are visited. */
export async function readPublicJson(url, { allowedOrigins = PUBLIC_ORIGINS, fetcher = fetch, maxBytes = 1048576 } = {}) {
  const target = new URL(url);
  if (!allowedOrigins.includes(target.origin) || !['/api/release', '/api/guide'].includes(target.pathname)
    || target.search || target.hash || target.username || target.password) throw new SafetyError('PUBLIC_INSPECTION_NOT_ALLOWLISTED');
  const response = await fetcher(url, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new SafetyError('UNVERIFIED_REDIRECT_REFUSED'); }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new SafetyError('PUBLIC_ENDPOINT_UNAVAILABLE'); }
  const reader = response.body?.getReader();
  if (!reader) throw new SafetyError('EMPTY_PUBLIC_RESPONSE');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new SafetyError('PUBLIC_RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes: size };
  } finally { reader.releaseLock(); }
}

export async function sourceInventory() {
  const root = process.cwd();
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const sourceFiles = ['src/components/realtime.tsx', 'src/components/feed.tsx', 'src/components/app-provider.tsx', 'public/sw.js'];
  const files = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await readFile(file, 'utf8')])));
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const migrationHashes = await Promise.all(migrations.map(async name => [name, digest(await readFile('supabase/migrations/' + name))]));
  const checked = (match, value) => match ? value : null;
  const timers = {
    inbox_poll_ms: checked(files[sourceFiles[0]].includes('setInterval(refresh, 20000)'), 20000),
    wall_poll_ms: checked(files[sourceFiles[1]].includes('setInterval(refresh, 30000)'), 30000),
    guide_poll_ms: checked(files[sourceFiles[2]].includes('}, 60000)'), 60000),
    public_images_per_guide_refresh_cap: checked(files[sourceFiles[3]].includes('.slice(0, 60)'), 60),
  };
  const backendConfigs = [];
  for (const filename of ['.env.local', '.env.backend.local']) {
    let content;
    try { content = await readFile(filename, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const raw = content.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1];
    let reference = null;
    try { reference = new URL(raw).hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1] ?? null; } catch { /* No inference from an unparsed value. */ }
    backendConfigs.push({ file: filename, project_ref: reference, production_backend: reference === null ? null : reference === PRODUCTION_PROJECT });
  }
  const polling = Object.values(timers).every(value => value !== null)
    ? Number((500 / (timers.inbox_poll_ms / 1000) + 500 / (timers.wall_poll_ms / 1000) + 500 / (timers.guide_poll_ms / 1000)).toFixed(2)) : null;
  return {
    application_source_sha: git(['rev-parse', 'HEAD']), working_tree_dirty: git(['status', '--porcelain']).length > 0,
    source_fingerprints: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, digest(content)])),
    migrations: { count: migrations.length, fingerprint: digest(JSON.stringify(migrationHashes)) }, backend_configs: backendConfigs,
    workload: { ...timers, planning_only_wall_heavy_poll_requests_per_second_at_500: polling,
      excludes: ['navigation', 'login and identity', 'message invalidation fan-out', 'image transfer', 'backend query/signing fan-out'],
      measured_capacity: false },
  };
}

export async function preflight({ inspectPublic = false } = {}) {
  const report = {
    schema_version: 1, kind: 'read_only_preflight', observed_at_utc: new Date().toISOString(), source: await sourceInventory(),
    protected_production: { supabase_project_ref: PRODUCTION_PROJECT, event_id: PRODUCTION_EVENT, aliases: PUBLIC_ORIGINS },
    public_inspection: [], read_only_http_attempts: 0,
    unresolved: ['approved isolated target', 'effective Auth/Realtime/Vercel quotas and live usage', 'numeric run budget and approved window',
      'separate normal-user fixture lifecycle', 'hosted runner and independent provider telemetry', 'database and asset restore rehearsal', 'account email delivery'],
    hosted_execution: 'disabled_in_this_implementation_slice', verdicts: { capacity: 'blocked', resilience: 'not_tested', recovery: 'not_tested', account_email: 'not_tested' },
  };
  if (!inspectPublic) return report;
  for (const origin of PUBLIC_ORIGINS) {
    const observation = { origin };
    for (const path of ['/api/release', '/api/guide']) {
      report.read_only_http_attempts++;
      try {
        const { data, bytes } = await readPublicJson(origin + path);
        // Never persist response bodies, names, contact details, images or tokens.
        if (path === '/api/release') observation.release = { revision: typeof data.revision === 'string' && /^[a-f0-9]{40}$/.test(data.revision) ? data.revision : null, mode: ['live','demo'].includes(data.mode) ? data.mode : 'unknown', email_gate_open: data.emailSignupOpen === true, response_bytes: bytes };
        else observation.guide = { event_matches: data.event?.id === PRODUCTION_EVENT, published: data.event?.published === true,
          sessions: Array.isArray(data.sessions) ? data.sessions.length : null, sponsors: Array.isArray(data.sponsors) ? data.sponsors.length : null,
          community_enabled: data.communityEnabled === true, response_bytes: bytes };
      } catch (error) { observation[path] = { error: error instanceof SafetyError ? error.code : 'PUBLIC_INSPECTION_FAILED' }; }
    }
    report.public_inspection.push(observation);
  }
  return report;
}
