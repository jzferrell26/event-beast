import { AuthScreen } from "@/components/auth";
import { isDemo } from "@/lib/server/guide";
import { safeNext } from "@/lib/format";
import { serverSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export const metadata = { title: "Sign in" };
export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === 'string' ? query.next : null);
  if (!isDemo() && query.mode !== 'recover' && !query.error) {
    const db = await serverSupabase();
    const identity = await db?.auth.getUser();
    if (identity?.data.user?.email_confirmed_at) redirect(next);
  }
  return <AuthScreen initialMode={query.mode === "recover" ? "recover" : query.mode === "sign-up" ? "sign-up" : "sign-in"} demo={isDemo()} emailReady={process.env.EVENT_BEAST_EMAIL_READY === 'true'} next={next} linkError={query.error === "link"} />;
}
