import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";
import { authenticationOrigin } from '@/lib/auth-navigation';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = authenticationOrigin(process.env.EVENT_BEAST_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL);
  const code = url.searchParams.get("code");
  const db = await serverSupabase();
  if (code && db) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/auth?error=link", origin));
}
