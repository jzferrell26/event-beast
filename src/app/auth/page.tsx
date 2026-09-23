import { AuthScreen } from "@/components/auth";
import { isDemo } from "@/lib/server/guide";
import { safeNext } from "@/lib/format";
export const metadata = { title: "Sign in" };
export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <AuthScreen initialMode={query.mode === "recover" ? "recover" : query.mode === "sign-up" ? "sign-up" : "sign-in"} demo={isDemo()} next={safeNext(typeof query.next === "string" ? query.next : null)} linkError={query.error === "link"} />;
}
