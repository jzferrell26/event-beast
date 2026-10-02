import { z } from "zod";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";
import { authenticationOrigin } from '@/lib/auth-navigation';
import { isDemo } from "@/lib/server/guide";
import { ApiError, handle, json, parseBody } from "@/lib/server/http";

export const maxDuration = 60;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: z.email(), password: z.string().min(1).max(256), next: z.string().optional() }),
  z.object({ action: z.literal("sign-up"), email: z.email(), password: z.string().min(8, "Use at least 8 characters").max(256) }),
  z.object({ action: z.literal("recover"), email: z.email() }),
  z.object({ action: z.literal('resend'), email: z.email() }),
  z.object({ action: z.literal('verify-email'), email: z.email(), token: z.string().regex(/^\d{6,10}$/) }),
  z.object({ action: z.literal("update-password"), password: z.string().min(8, "Use at least 8 characters").max(256), expectedUserId: z.uuid() }),
  z.object({ action: z.literal("sign-out") }),
]);
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, schema);
  if (isDemo()) throw new ApiError(409, "This is a sample preview. Event sign-in will open after the organizer connects registration.");
  const db = await serverSupabase();
  if (!db) throw new ApiError(503, "Event sign-in is not available yet.");
  const configuredSite = process.env.EVENT_BEAST_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredSite) throw new ApiError(503, "Event sign-in is being configured.");
  const site = authenticationOrigin(configuredSite);
  const verifiedNext = '/account-ready';
  const emailReady = process.env.EVENT_BEAST_EMAIL_READY === 'true';
  const recoveryReady = emailReady || process.env.EVENT_BEAST_RECOVERY_READY === 'true';
  if (['sign-up', 'resend'].includes(body.action) && !emailReady) {
    throw new ApiError(503, 'Account email delivery is being prepared by the event team. The public agenda is available now.');
  }
  if (body.action === 'recover' && !recoveryReady) throw new ApiError(503, 'Password recovery email is being prepared by the event team. Please contact event support.');
  const checkedAuthError = (error: { status?: number; code?: string } | null, fallback: string) => {
    if (!error) return;
    if (error.code === 'over_email_send_rate_limit') throw new ApiError(503, 'Verification email delivery is busy. Check your inbox and try again later, or visit the welcome desk.');
    throw new ApiError(error.status === 429 ? 429 : 400, error.status === 429 ? 'A lot of attendees are joining. Your browser will retry shortly.' : fallback);
  };
  if (body.action === "sign-in") {
    const { error } = await db.auth.signInWithPassword({ email: body.email.trim().toLowerCase(), password: body.password });
    checkedAuthError(error, 'Check your email and password, and make sure your email is verified.');
    return json({ next: safeNext(body.next) });
  }
  if (body.action === "sign-up") {
    const { error } = await db.auth.signUp({ email: body.email.trim().toLowerCase(), password: body.password,
      options: { emailRedirectTo: `${site}/auth/callback?next=${verifiedNext}` } });
    checkedAuthError(error, 'We could not create your account. Please try signing in or use password recovery.');
    return json({ message: "Check your email to verify your account. After verification, you can join the attendee community with this email." });
  }
  if (body.action === "recover") {
    const { error } = await db.auth.resetPasswordForEmail(body.email.trim().toLowerCase(), { redirectTo: `${site}/auth/callback?next=/reset-password` });
    checkedAuthError(error, 'We could not request a reset right now. Please try again shortly.');
    return json({ message: "If an account exists for this email, a password reset link is on its way." });
  }
  if (body.action === 'resend') {
    const { error } = await db.auth.resend({ type: 'signup', email: body.email.trim().toLowerCase(), options: { emailRedirectTo: `${site}/auth/callback?next=${verifiedNext}` } });
    checkedAuthError(error, 'Check your inbox and wait a minute before requesting another code.');
    return json({ message: 'Check your email for your verification code.' });
  }
  if (body.action === 'verify-email') {
    const { error } = await db.auth.verifyOtp({ email: body.email.trim().toLowerCase(), token: body.token, type: 'signup' });
    checkedAuthError(error, 'That code could not be verified. Check the latest email or request a new code.');
    return json({ next: verifiedNext });
  }
  if (body.action === "update-password") {
    const { data, error: identityError } = await db.auth.getUser();
    if (identityError || !data.user) throw new ApiError(401, "Open the password reset link from your email first.");
    if (data.user.id !== body.expectedUserId) throw new ApiError(409, 'The signed-in account changed in another tab. Reload this page before setting a password.');
    const { error } = await db.auth.updateUser({ password: body.password });
    if (error) throw new ApiError(400, "Your password could not be changed. Request a new reset link and try again.");
    return json({ message: "Your password has been updated.", next: verifiedNext });
  }
  const { error } = await db.auth.signOut({ scope: 'local' });
  if (error) throw new ApiError(503, "Sign-out was not confirmed. Please try again.");
  return json({ next: "/auth" });
});
