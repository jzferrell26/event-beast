import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { backendEnvironment } from './backend-cli.mjs';

const mode = process.argv[2];
if (!['build', 'serve-qa'].includes(mode)) throw new Error('Choose build or serve-qa');
const backend = backendEnvironment();
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: backend.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: backend.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SITE_URL: 'https://event-beast.vercel.app' };
// Never copy the testing service key into the app process.
delete env.EVENT_BEAST_QUALIFICATION_SERVICE_KEY;
if (mode === 'serve-qa') {
  const fixture = JSON.parse(readFileSync('supabase/.temp/auth-qualification.json', 'utf8'));
  if (!['qualified', 'needs_review'].includes(fixture.phase)) throw new Error('Finish account qualification before browser testing.');
  env.EVENT_BEAST_DEMO_MODE = 'false'; env.EVENT_BEAST_EMAIL_READY = 'true';
  env.EVENT_BEAST_EVENT_SLUG = fixture.slug; env.EVENT_BEAST_SITE_URL = 'http://127.0.0.1:3101';
}
const args = mode === 'build' ? ['node_modules/next/dist/bin/next', 'build'] : ['node_modules/next/dist/bin/next', 'start', '--port', '3101'];
const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
child.on('exit', code => process.exit(code ?? 1));
process.on('SIGINT', () => child.kill('SIGINT'));
