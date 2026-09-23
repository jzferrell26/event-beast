import { getGuide } from "@/lib/server/guide";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { Brand } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function EventLayout({ children }: { children: React.ReactNode }) {
  const guide = await getGuide();
  if (!guide) return <div className="setup-screen"><Brand /><span className="eyebrow">MOMENTUM BUILDER LIVE 2026</span><h1>Good things are on the way.</h1><p>The event team is preparing your companion. Check back soon for the agenda, event details and attendee access.</p><a className="button button-dark" href="/auth">Attendee sign in</a></div>;
  return <AppProvider initialGuide={guide}><AppShell>{children}</AppShell></AppProvider>;
}
