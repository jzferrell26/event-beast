import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { emailLinkNavigation } from '@/lib/server/auth-email-navigation';
import { handle } from '@/lib/server/http';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
export const GET = (request: Request) => handle(async () => {
  const url = new URL(request.url);
  const navigation = emailLinkNavigation(url.searchParams);
  const canonical = new URL('/auth/callback', navigation.origin);
  canonical.search = url.search;
  const browserHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  // Issue session cookies only on the same host that initiated the email flow.
  if (browserHost !== canonical.host) return NextResponse.redirect(canonical, { status: 307, headers });
  const code = url.searchParams.get("code");
  if (code) {
    const db = await serverSupabase();
    if (db) {
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(navigation.next, navigation.origin), { status: 303, headers });
    }
  }
  const failure = navigation.workspace ? navigation.failure : '/auth?error=link';
  return NextResponse.redirect(new URL(failure, navigation.origin), { status: 303, headers });
});
