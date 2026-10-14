/** Runs only against reset loopback Supabase. No real Stripe account or payment. */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
function local(value, protocol, port) {
  const url = new URL(value);
  if (url.protocol !== protocol || url.hostname !== '127.0.0.1' || url.port !== port) throw new Error('Only the isolated billing fixture ports are supported.');
  return url;
}
function run(args,env) { const child=spawnSync('node',args,{env,stdio:'inherit'}); if(child.status!==0||child.error) throw new Error('Billing qualification failed.'); }
async function main() {
  const status=JSON.parse(execFileSync('npx',['--yes','supabase@2.121.0','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const api=local(status.API_URL,'http:','54361'); const db=local(status.DB_URL,'postgresql:','54362');
  if(db.username!=='postgres'||db.pathname!=='/postgres'||!status.SERVICE_ROLE_KEY||!status.ANON_KEY) throw new Error('Unexpected local credentials.');
  const password=`Local-${randomBytes(24).toString('hex')}`; const billingPassword=randomBytes(32).toString('hex');
  const admin=createClient(api.origin,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const users={};
  for(const actor of ['agency','buyer','other']) { const result=await admin.auth.admin.createUser({email:`${actor}@billing.example.test`,password,email_confirm:true}); if(result.error||!result.data.user) throw new Error('Reset local fixtures before qualification.'); users[actor]=result.data.user.id; }
  const connection=new Client({connectionString:db.toString()}); await connection.connect();
  try {
    await connection.query('insert into private.platform_owner(user_id) values($1)',[users.agency]);
    // The only interpolated SQL is a locally generated hex password, never input.
    if(!/^[a-f0-9]{64}$/.test(billingPassword)) throw new Error('Invalid fixture credential.');
    await connection.query(`alter role event_beast_billing login password '${billingPassword}'`);
  } finally { await connection.end(); }
  db.username='event_beast_billing'; db.password=billingPassword;
  const env={...process.env}; for(const name of Object.keys(env)) if(/SUPABASE|DATABASE_URL|PLAYWRIGHT_BASE_URL|EVENT_BEAST_|BILLING_TEST/.test(name)) delete env[name];
  Object.assign(env,{EVENT_BEAST_PLATFORM_ENABLED:'true',EVENT_BEAST_BILLING_ENABLED:'true',EVENT_BEAST_BILLING_MODE:'test',EVENT_BEAST_DEMO_MODE:'false',EVENT_BEAST_PUBLIC_SITE:'true',EVENT_BEAST_EMAIL_READY:'false',EVENT_BEAST_RECOVERY_READY:'false',EVENT_BEAST_PLATFORM_URL:'http://127.0.0.1:3191',EVENT_BEAST_SITE_URL:'http://127.0.0.1:3191',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3191',NEXT_PUBLIC_SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,EVENT_BEAST_BILLING_DATABASE_URL:db.toString(),BILLING_TEST_PASSWORD:password});
  console.log('Using disposable local Auth, Postgres and a Stripe HTTP fixture. No hosted payment credentials are loaded.');
  run(['node_modules/vitest/vitest.mjs','run','--config','vitest.billing-local.config.ts'],env);
  run(['scripts/prepare-photo-decoder.mjs'],env);
  run(['node_modules/next/dist/bin/next','build'],env);
  run(['node_modules/@playwright/test/cli.js','test','--config','playwright.billing.config.ts'],env);
}
main().catch(()=>{console.error('Local billing qualification failed. Inspect the checks above. Production targets are not supported.');process.exitCode=1;});
