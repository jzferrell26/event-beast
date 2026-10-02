import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';
describe('safe transactional templates',()=>{
 for(const [file,type] of [['confirmation','signup'],['invite','invite'],['recovery','recovery']])it(`${file} uses only the recipient-confirmation route and an explicit action`,async()=>{
  const html=await readFile(`supabase/templates/${file}.html`,'utf8');
  expect(html).toContain('Continue securely');expect(html).toContain('{{ .Email }}');
  expect(html).toContain(`/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`);
  expect(html).not.toMatch(/\.ConfirmationURL|\.RedirectTo|<script|<form|<input|<button|<img|onclick=|\/auth\/v1\/verify|http:\/\//i);
  expect(html.match(/href=/g)).toHaveLength(1);
  if(file==='confirmation'){expect(html).toContain('{{ .Token }}');expect(html).toContain('next=/account-ready');}
  expect(html).not.toContain('next=/more/profile');
 });
});

it('production Auth is branded to Momentum Builder without opening the email gate',async()=>{
 const config=await readFile('supabase/config.toml','utf8');
 expect(config).toContain('site_url = "https://2026live.momentumbuilder.com"');
 expect(config).toContain('host = "smtp.resend.com"');
 expect(config).toContain('user = "resend"');
 expect(config).toContain('pass = "env(RESEND_SMTP_PASSWORD)"');
 expect(config).toContain('admin_email = "accounts@noreply.momentumbuilder.com"');
 expect(config).toContain('sender_name = "Momentum Builder LIVE 2026"');
 const env=await readFile('.env.example','utf8');
 expect(env).toContain('EVENT_BEAST_EMAIL_READY=false');
 expect(env).toContain('EVENT_BEAST_RECOVERY_READY=false');
});
