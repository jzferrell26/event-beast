# Momentum Builder account-email branding

## Current production state

The account-email templates and canonical link host are branded for Momentum Builder. Sonia's final event domain is `https://2026live.momentumbuilder.com`; production Auth and Vercel use that origin. `eventapp.momentumbuilder.com` and the former Vercel callbacks remain temporarily allowlisted only for already-issued links.

The October 2 recovery probe to the project owner succeeded and arrived with the correct Momentum Builder subject/template, but its sender was still `Supabase Auth <noreply@mail.app.supabase.io>`. It did not appear in Resend's outbound log. This proves custom SMTP is the remaining sender-branding step.

Keep `EVENT_BEAST_EMAIL_READY=false` until a post-SMTP recovery/invitation test arrives through Resend and the recipient link opens on the Momentum Builder host.

## Approved SMTP configuration

- Provider: Resend
- Verified sending domain: `noreply.momentumbuilder.com`
- From: `Momentum Builder LIVE 2026 <accounts@noreply.momentumbuilder.com>`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: use the dedicated domain-restricted Resend API credential; never commit it to this repository
- Open/click tracking: disabled for account mail

Supabase Dashboard path: **Authentication → Emails → SMTP Settings**. Save the values above, then run the independent-inbox recovery/invite checks before enabling attendee email.

Source configuration is declared in `supabase/config.toml` using `env(RESEND_SMTP_PASSWORD)` so future configuration pushes do not require a committed credential.

## Verification gate

After SMTP is saved:

1. Send one recovery email to an existing test/owner account.
2. Confirm the Resend transactional log records the message.
3. Confirm the inbox sender displays `Momentum Builder LIVE 2026` from the `noreply.momentumbuilder.com` domain.
4. Confirm the activation/reset link begins with `https://2026live.momentumbuilder.com/auth/confirm`.
5. Complete the recipient-click flow and confirm password setup/login still works.
6. Repeat with one invitation to a separate test inbox.
7. Only after those checks and send-capacity review, change `EVENT_BEAST_EMAIL_READY` to `true` and redeploy.

This email configuration is transactional account mail only. It does not enable marketing email or the attendee invitation wave.
