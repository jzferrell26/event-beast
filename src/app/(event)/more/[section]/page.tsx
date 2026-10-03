import { notFound, redirect } from "next/navigation";
import { getGuide } from '@/lib/server/guide';
import { SponsorsScreen, LunchScreen, NotificationsScreen, HelpScreen } from "@/components/more";
import { ActivitiesScreen } from "@/components/activities";
import { AgendaScreen } from "@/components/agenda";
import { ProfileScreen } from "@/components/profile";
import { pageAccess } from "@/lib/server/auth";
import { SpeakersScreen } from '@/components/speakers';
import { publicSiteEnabled } from '@/lib/public-site';
export default async function MoreSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "profile" || (section === "saved" && !publicSiteEnabled())) await pageAccess(`/more/${section}`);
  switch (section) {
    case 'speakers': return <SpeakersScreen />;
    case "sponsors": return <SponsorsScreen />;
    case "lunch": return <LunchScreen />;
    case "venue": redirect('/more/help');
    case "activities": redirect('/more/fun-stuff');
    case "fun-stuff": return <ActivitiesScreen />;
    case "profile": return <ProfileScreen />;
    case "saved": return <AgendaScreen savedOnly />;
    case "notifications": if ((await getGuide())?.settings.announcements_enabled === false) notFound(); return <NotificationsScreen />;
    case "help": return <HelpScreen />;
    default: notFound();
  }
}
