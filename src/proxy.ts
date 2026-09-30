import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./lib/supabase/config";
import { sessionCookieOptions } from './lib/supabase/session-options';
import { publicRouteDecision, publicSiteEnabled } from './lib/public-site';

export async function proxy(request: NextRequest) {
  if (publicSiteEnabled()) {
    const decision = publicRouteDecision(request.nextUrl.pathname);
    if (decision.disabled) return NextResponse.json({ error: 'Community profiles and messaging are not part of this public event guide.' }, { status: 410, headers: { 'Cache-Control': 'private, no-store' } });
    if (decision.redirect) return NextResponse.redirect(new URL(decision.redirect, request.url), 307);
  }
  const config = supabaseConfig();
  let response = NextResponse.next({ request });
  if (!config || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;
  const db = createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await db.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|api/guide|sw.js|offline|icons|manifest.webmanifest|favicon.ico).*)"] };
