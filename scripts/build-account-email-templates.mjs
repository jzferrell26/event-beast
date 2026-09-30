import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Template generation only. No API call, message send, credentials or sender
// defaults. Supabase expands these variables only at actual account delivery.
export const accountTemplates=[
 {key:'confirmation',type:'signup',subject:'Verify your Momentum Builder event account',heading:'Your event starts here.',intro:'Use this code on the event website to verify your email. You can also open the secure link below.',button:'Verify my email',next:'&amp;next=/account-ready',code:true},
 {key:'invite',type:'invite',subject:'Activate your Momentum Builder event account',heading:'You’re invited to the event hub.',intro:'The organizer has invited this email address. Open the secure link, press Continue securely, then choose a password with at least 12 characters.',button:'Activate my account',next:'',code:false},
 {key:'recovery',type:'recovery',subject:'Reset your Momentum Builder event password',heading:'Let’s get you back in.',intro:'Open the secure link, press Continue securely, then choose a new password with at least 12 characters. Your password stays unchanged until you finish.',button:'Reset my password',next:'',code:false},
];
export function renderAccountTemplate(t){
 return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${t.subject}</title></head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;background-color:#f4f4f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f4f4f3" style="padding-top:28px;padding-right:16px;padding-bottom:28px;padding-left:16px;background-color:#f4f4f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td bgcolor="#17171b" style="background-color:#17171b;padding-top:24px;padding-right:28px;padding-bottom:24px;padding-left:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#ffffff;font-weight:bold;">MOMENTUM BUILDER LIVE 2026</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding-top:28px;padding-right:28px;padding-bottom:28px;padding-left:28px;">
<h1 style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;color:#17171b;">${t.heading}</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#303039;">Account: <strong>{{ .Email }}</strong></p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#303039;">${t.intro}</p>
${t.code?'<p style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:44px;color:#17171b;font-weight:bold;letter-spacing:5px;">{{ .Token }}</p>':''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#bc182c" style="background-color:#bc182c;padding-top:14px;padding-right:20px;padding-bottom:14px;padding-left:20px;"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${t.type}${t.next}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#ffffff;font-weight:bold;text-decoration:none;">${t.button}</a></td></tr></table>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#555560;">Opening the link does not use it. Press Continue securely once on the event website. Confirm the email shown before setting a password.</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#555560;">Access is matched to the organizer’s registration list. The public agenda needs no account. Your directory profile remains private until you choose to share it.</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#555560;">This link is time-limited and private. Do not forward it. If you did not request or expect this email, ignore it or contact the event organizer.</p>
</td></tr></table></td></tr></table></body></html>
`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await mkdir('supabase/templates',{recursive:true});
 for(const t of accountTemplates)await writeFile(`supabase/templates/${t.key}.html`,renderAccountTemplate(t));
 console.log('Prepared confirmation, invitation and recovery templates. No email was sent; hosted configuration is unchanged.');
}
