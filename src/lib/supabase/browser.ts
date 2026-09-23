"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
import { sessionCookieOptions } from './session-options';

let client: ReturnType<typeof createBrowserClient> | null = null;
export function browserSupabase() {
  if (client) return client;
  const config = supabaseConfig();
  if (!config) return null;
  client = createBrowserClient(config.url, config.key, { cookieOptions: sessionCookieOptions() });
  return client;
}
