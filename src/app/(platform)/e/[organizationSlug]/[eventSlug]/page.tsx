import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicPlatformGuide } from '@/lib/server/platform-guide';
import { PublicEventGuide } from '@/components/platform/public-guide';

type Props = { params: Promise<{ organizationSlug: string; eventSlug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { organizationSlug, eventSlug } = await params;
  const guide = await publicPlatformGuide(organizationSlug, eventSlug);
  return guide ? { title: { absolute: guide.event.name }, description: guide.event.tagline || `The event guide for ${guide.event.name}.`, openGraph: { title: guide.event.name, description: guide.event.tagline, siteName: guide.event.name }, twitter: { title: guide.event.name, description: guide.event.tagline } } : { title: { absolute: 'Event not available | Event Beast' } };
}
export default async function PublicEventPage({ params }: Props) { const { organizationSlug, eventSlug } = await params; const guide = await publicPlatformGuide(organizationSlug, eventSlug); if (!guide) notFound(); return <PublicEventGuide guide={guide} />; }
