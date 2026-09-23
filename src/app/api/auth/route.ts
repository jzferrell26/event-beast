import { z } from "zod";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";
import { isDemo } from "@/lib/server/guide";
import { ApiError, handle, json, parseBody } from "@/lib/server/http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: z.email(), password: z.string().min(1).max(256), next: z.string().optional() }),
  z.object({ action: z.literal("sign-up"), email: z.email(), password: z.string().min(12, "Use at least 12 characters").max(256) }),
  z.object({ action: z.literal("recover"), email: z.email() }),
  z.object({ action: z.literal("update-password"), password: z.string().min(12, "Use at least 12 characters").max(256) }),
  z.object({ action: z.literal("sign-out") }),
]);
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, schema);
  if (isDemo()) throw new ApiError(409, "This is a sample preview. Event sign-in will open after the organizer connects registration.");
  const db = await serverSupabase();
  if (!db) throw new ApiError(503, "Event sign-in is not available yet.");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new ApiError(503, "Event sign-in is being configured.");
  if (body.action === "sign-in") {
    const { error } = await db.auth.signInWithPassword({ email: body.email.trim().toLowerCase(), password: body.password });
    if (error) throw new ApiError(error.status === 429 ? 429 : 400, error.status === 429 ? "Please wait a moment before trying again." : "Check your email and password, and make sure your email is verified.");
    return json({ next: safeNext(body.next) });
  }
  if (body.action === "sign-up") {
    const { error } = await db.auth.signUp({ email: body.email.trim().toLowerCase(), password: body.password,
      options: { emailRedirectTo: `${site}/auth/callback?next=/more/profile` } });
    if (error) throw new ApiError(400, "We could not create your account. Please try again or use password recovery.");
    return json({ message: "Check your email to verify your account. Event access will be matched to the registration email supplied by the organizer." });
  }
  if (body.action === "recover") {
    const { error } = await db.auth.resetPasswordForEmail(body.email.trim().toLowerCase(), { redirectTo: `${site}/auth/callback?next=/reset-password` });
    if (error) throw new ApiError(400, "We could not request a reset right now. Please try again shortly.");
    return json({ message: "If an account exists for this email, a password reset link is on its way." });
  }
  if (body.action === "update-password") {
    const { data, error: identityError } = await db.auth.getUser();
    if (identityError || !data.user) throw new ApiError(401, "Open the password reset link from your email first.");
    const { error } = await db.auth.updateUser({ password: body.password });
    if (error) throw new ApiError(400, "Your password could not be changed. Request a new reset link and try again.");
    return json({ message: "Your password has been updated.", next: "/" });
  }
  const { error } = await db.auth.signOut();
  if (error) throw new ApiError(503, "Sign-out was not confirmed. Please try again.");
  return json({ next: "/auth" });
});
