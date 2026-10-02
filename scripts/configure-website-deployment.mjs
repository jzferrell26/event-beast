import { readFileSync } from 'node:fs';
import { backendEnvironment, cli } from './backend-cli.mjs';

// Configure only this already-linked Event Beast project. App runtime receives
// its publishable key, never the administrative key used for qualification.
const link = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
if (link.projectId !== 'prj_hN2Ee5abVkKs5t6xbKgESvZFR6bp') throw new Error('Unexpected Vercel project.');
const backend = backendEnvironment();
const settings = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'production', backend.NEXT_PUBLIC_SUPABASE_URL],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'production', backend.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
  ['NEXT_PUBLIC_SITE_URL', 'production', 'https://2026live.momentumbuilder.com'],
  ['NEXT_PUBLIC_EVENT_SLUG', 'production', 'momentum-builder-live-2026'],
  ['EVENT_BEAST_EMAIL_READY', 'production', 'true'],
  ['EVENT_BEAST_EMAIL_READY', 'preview,development', 'false'],
  ['EVENT_BEAST_RECOVERY_READY', 'production', 'true'],
  ['EVENT_BEAST_RECOVERY_READY', 'preview,development', 'false'],
  ['EVENT_BEAST_DEMO_MODE', 'production', 'false'],
  ['EVENT_BEAST_DEMO_MODE', 'preview,development', 'true'],
];
for (const [name, target, value] of settings) {
  cli(['vercel', 'env', 'add', name, target, '--force', '--yes', '--no-sensitive', '--scope', 'cuantico-ai'], { input: value });
  console.log(JSON.stringify({ configured: name, environment: target, secretValuePrinted: false }));
}
console.log('Public event website is configured for the dedicated backend. Verified attendee self-service email is enabled in production.');
