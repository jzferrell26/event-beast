import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {accountTemplates,renderAccountTemplate} from './build-account-email-templates.mjs';

// Read-only readiness report. Optional --hosted-config points to a privately
// fetched Management API auth-config JSON; never print that file or SMTP secrets.
const args=process.argv.slice(2),get=flag=>{const at=args.indexOf(flag);return at<0?null:args[at+1];};
const site=new URL(get('--site')??'https://2026live.momentumbuilder.com');
assert.ok(site.protocol==='https:'&&!site.username&&!site.password&&site.pathname==='/','Use the configured HTTPS origin, without path or credentials.');
const hostedPath=get('--hosted-config');const config=hostedPath?JSON.parse(await readFile(hostedPath,'utf8')):null;
const checks=[];const check=(key,passed,detail)=>checks.push({key,status:passed===null?'unknown':passed?'pass':'blocked',detail});
const patch={};
for(const template of accountTemplates){
 const text=await readFile(`supabase/templates/${template.key}.html`,'utf8');
 check(`template_${template.key}`,text===renderAccountTemplate(template),'Source template uses the recipient-click confirmation page and no tracking links.');
 patch[`mailer_subjects_${template.key}`]=template.subject;
 patch[`mailer_templates_${template.key}_content`]=text;
 check(`hosted_template_${template.key}`,config?config[`mailer_templates_${template.key}_content`]===text:null,'Requires exact hosted template verification before enabling account email.');
}
check('canonical_auth_origin',config?config.site_url===site.origin:null,'Hosted Auth and deployed application must use the same approved origin.');
check('email_confirmation',config?config.mailer_autoconfirm===false:null,'Email ownership verification must remain enabled.');
check('password_minimum',config?Number(config.password_min_length)>=12:null,'Require at least 12 characters.');
check('smtp_configured',config?!!(config.smtp_host&&config.smtp_user&&config.smtp_admin_email):null,'A verified sending domain alone does not configure custom SMTP.');
check('email_send_capacity',config?Number(config.rate_limit_email_sent)>=500:null,'Plan enough account-email capacity for the expected cohort, plus retries; this is not a deliverability guarantee.');
check('approved_from_address',null,'The exact From and Reply-To addresses still require owner confirmation.');
check('independent_inbox_delivery',null,'Test real signup/invite/recovery delivery and recipient activation before opening the email gate.');
let release=null;try{release=await(await fetch(site.origin+'/api/release',{signal:AbortSignal.timeout(10000)})).json();}catch{}
check('deployment_visible',release?.application==='event-beast', 'Read-only production metadata probe.');
await mkdir('test-results/account-email',{recursive:true});
await writeFile('test-results/account-email/template-only-patch.json',JSON.stringify(patch,null,2));
const report={checkedAt:new Date().toISOString(),site:site.origin,ready:checks.every(c=>c.status==='pass'),emailGateOpen:release?.emailSignupOpen??null,checks,templatePatchSha256:createHash('sha256').update(JSON.stringify(patch)).digest('hex'),hostedChangesApplied:false,emailSent:false};
await writeFile('test-results/account-email/preflight.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
