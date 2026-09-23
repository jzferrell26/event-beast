import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const db = await serverSupabase();
  if (db && token_hash && type && ["signup", "recovery", "invite", "email_change", "email"].includes(type)) {
    const { error } = await db.auth.verifyOtp({ token_hash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : safeNext(url.searchParams.get("next") || "/more/profile"), url.origin));
  }
  return NextResponse.redirect(new URL("/auth?error=link", url.origin));
}
