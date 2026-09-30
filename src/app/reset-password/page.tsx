import { AuthScreen } from "@/components/auth";
import { isDemo } from "@/lib/server/guide";
import { serverSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export const metadata = { title: "Reset password" };
export const dynamic = 'force-dynamic';
export default async function ResetPasswordPage() {
  const demo = isDemo();
  const identity = !demo ? await (await serverSupabase())?.auth.getUser() : null;
  if (!demo && (!identity?.data.user || identity.error)) redirect('/auth?mode=recover&error=link&force=1');
  return <AuthScreen initialMode="update-password" demo={demo} verifiedEmail={identity?.data.user?.email} expectedUserId={identity?.data.user?.id} />;
}
