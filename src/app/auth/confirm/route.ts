import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase/server';
import { emailLinkNavigation } from '@/lib/server/auth-email-navigation';
import { assertSameOrigin, handle, ApiError } from '@/lib/server/http';

// no-referrer suppresses Origin on HTML form POSTs. strict-origin preserves
// the CSRF check while withholding the path/query token from Referer.
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'strict-origin', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const validTypes = ['signup', 'recovery', 'invite', 'email_change', 'email'];
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const validTokenHash = (value: string) => /^(?:pkce_)?[a-fA-F0-9]{32,256}$/.test(value);
const fail = (navigation: ReturnType<typeof emailLinkNavigation>) => NextResponse.redirect(new URL(navigation.failure, navigation.origin), { status: 303, headers });

/** GET/HEAD never verify a token or sign anyone out. Mail scanners may follow
 * every link; only the recipient's deliberate same-origin POST consumes it. */
export const GET = (request: Request) => handle(async () => {
  const url = new URL(request.url);
  const navigation = emailLinkNavigation(url.searchParams, '/account-ready');
  const hash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? '';
  if (!validTokenHash(hash) || !validTypes.includes(type)) return fail(navigation);
  const canonical = new URL('/auth/confirm', navigation.origin);
  canonical.search = url.search;
  const browserHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  if (browserHost !== canonical.host) return NextResponse.redirect(canonical, { status: 307, headers });
  const next = navigation.next;
  const title = navigation.workspace ? 'Event Beast' : 'Momentum Builder LIVE';
  const brand = navigation.workspace ? 'EVENT BEAST' : 'MOMENTUM BUILDER LIVE 2026';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue securely | ${title}</title><style>body{margin:0;background:#f4f4f3;color:#202025;font:17px/1.65 system-ui,sans-serif}main{max-width:480px;margin:8vh auto;background:white;padding:36px;border-radius:18px}h1{font-size:30px;line-height:1.2}button{font:inherit;font-weight:700;background:#bc182c;color:white;border:0;border-radius:8px;padding:15px 24px;width:100%;cursor:pointer}a{color:#971326}small{display:block;margin-top:20px;color:#555}@media(max-width:560px){main{margin:24px 16px;padding:26px}}</style></head><body><main><p>${brand}</p><h1>One more step. Then you’re in.</h1><p>Continue to verify this email link${['invite', 'recovery'].includes(type) ? ' and choose your password' : ''}.</p><p>This will switch this browser to the account associated with your link. Keep it private.</p><form method="post" action="/auth/confirm"><input type="hidden" name="token_hash" value="${escape(hash)}"><input type="hidden" name="type" value="${escape(type)}"><input type="hidden" name="next" value="${escape(next)}">${navigation.workspace ? '<input type="hidden" name="context" value="workspace">' : ''}<button type="submit">Continue securely</button></form><small>Opening this page does not use your link. Press the button once, then keep the next page open while setting your password.</small><p><a href="${escape(navigation.signIn)}">Back to sign in</a></p></main></body></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
});

export const POST = (request: Request) => handle(async () => {
  assertSameOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new ApiError(400, 'Submit the confirmation form.');
  if (Number(request.headers.get('content-length') ?? 0) > 4096) throw new ApiError(413, 'The link is too large.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4096) throw new ApiError(413, 'The link is too large.');
  const form = new URLSearchParams(raw);
  const navigation = emailLinkNavigation(form, '/account-ready');
  if (request.headers.get('origin') !== navigation.origin) throw new ApiError(403, 'Open the link on the configured website.');
  const hash = form.get('token_hash') ?? '', type = form.get('type') ?? '';
  if (!validTokenHash(hash) || !validTypes.includes(type)) return fail(navigation);
  const db = await serverSupabase();
  if (!db) throw new ApiError(503, 'Event sign-in is temporarily unavailable. Your link was not used.');
  // verifyOtp replaces the local session on success. A bad link must not sign
  // out a currently valid session or change an unrelated account's password.
  const { error } = await db.auth.verifyOtp({ token_hash: hash, type: type as EmailOtpType });
  if (error) return fail(navigation);
  const next = ['invite', 'recovery'].includes(type) ? navigation.passwordSetup : navigation.next;
  return NextResponse.redirect(new URL(next, navigation.origin), { status: 303, headers });
});
