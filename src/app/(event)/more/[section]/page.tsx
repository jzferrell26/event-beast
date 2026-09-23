import { notFound } from "next/navigation";
import { SponsorsScreen, LunchScreen, VenueScreen, NotificationsScreen, HelpScreen } from "@/components/more";
import { AgendaScreen } from "@/components/agenda";
import { ProfileScreen } from "@/components/profile";
import { pageAccess } from "@/lib/server/auth";
import { SpeakersScreen } from '@/components/speakers';
export default async function MoreSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "profile" || section === "saved") await pageAccess(`/more/${section}`);
  switch (section) {
    case 'speakers': return <SpeakersScreen />;
    case "sponsors": return <SponsorsScreen />;
    case "lunch": return <LunchScreen />;
    case "venue": return <VenueScreen />;
    case "profile": return <ProfileScreen />;
    case "saved": return <AgendaScreen savedOnly />;
    case "notifications": return <NotificationsScreen />;
    case "help": return <HelpScreen />;
    default: notFound();
  }
}
