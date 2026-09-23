import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// User approved one additional Micro project (~$10/month) on September 23.
// No credentials are printed or committed. Re-running first checks the account.
const organization = 'mxxyymcjlwbzlitbttli';
function cli(command, env = {}) {
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npx.cmd supabase ${command}`], {
    encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...env }, windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Supabase command failed (${result.status}); verify the project list before retrying.`);
  return JSON.parse(result.stdout);
}
const listing = cli('projects list --output json');
const projects = Array.isArray(listing) ? listing : listing.projects;
if (!Array.isArray(projects)) throw new Error('Project listing was not recognized. No project was created.');
const existing = projects.filter(p => p.organization_id === organization && p.name === 'event-beast');
if (existing.length > 1) throw new Error('Multiple Event Beast projects found; identify the canonical project.');
mkdirSync('supabase/.temp', { recursive: true });
if (existing.length) {
  writeFileSync('supabase/.temp/event-beast-project.json', JSON.stringify(existing[0], null, 2));
  console.log(JSON.stringify({ created: false, id: existing[0].id, name: existing[0].name, status: existing[0].status }));
} else {
  const path = '.env.infrastructure.local';
  if (!existsSync(path)) writeFileSync(path, `SUPABASE_DB_PASSWORD=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  const password = readFileSync(path, 'utf8').match(/^SUPABASE_DB_PASSWORD=([a-f0-9]{64})$/m)?.[1];
  if (!password) throw new Error('Provisioning password file needs review. No project was created.');
  const created = cli(`projects create event-beast --org-id ${organization} --region us-east-1 --size micro --db-password %EVENT_BEAST_PROVISION_PASSWORD% --yes --output json`, { EVENT_BEAST_PROVISION_PASSWORD: password });
  writeFileSync('supabase/.temp/event-beast-project.json', JSON.stringify(created, null, 2));
  const project = created.project || created;
  console.log(JSON.stringify({ created: true, id: project.id, name: project.name, status: project.status, organization }));
}
