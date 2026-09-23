import { pageAccess } from "@/lib/server/auth";
import { consoleGuide } from "@/lib/server/admin";
import { AppProvider } from "@/components/app-provider";
import { AdminShell } from "@/components/admin";
export const dynamic = "force-dynamic";
export const metadata = { title: "Organizer console" };
export default async function AdminLayout({ children }: { children: React.ReactNode }) { await pageAccess("/admin", true); const guide = await consoleGuide(); return <AppProvider initialGuide={guide}><AdminShell>{children}</AdminShell></AppProvider>; }
