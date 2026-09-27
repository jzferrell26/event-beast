import { AuthScreen } from "@/components/auth";
import { isDemo } from "@/lib/server/guide";
export const metadata = { title: "Reset password" };
export const dynamic = 'force-dynamic';
export default function ResetPasswordPage() { return <AuthScreen initialMode="update-password" demo={isDemo()} />; }
