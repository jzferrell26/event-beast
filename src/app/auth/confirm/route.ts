import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";
import { authenticationOrigin } from '@/lib/auth-navigation';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = authenticationOrigin(process.env.EVENT_BEAST_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const db = await serverSupabase();
  if (db && token_hash && type && ["signup", "recovery", "invite", "email_change", "email"].includes(type)) {
    // Invitation/recovery links belong to one identity. A browser may already
    // hold another Event Beast session; clear it before consuming the token so
    // the callback cannot update or redirect the wrong account.
    if (type === 'invite' || type === 'recovery') await db.auth.signOut({ scope: 'local' });
    const { error } = await db.auth.verifyOtp({ token_hash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" || type === 'invite' ? "/reset-password" : safeNext(url.searchParams.get("next") || "/more/profile"), origin));
  }
  return NextResponse.redirect(new URL("/auth?error=link&force=1", origin));
}
