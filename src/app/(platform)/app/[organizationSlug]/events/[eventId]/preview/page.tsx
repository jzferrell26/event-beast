import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { uuid } from '@/lib/validation';
import { previewPlatformGuide } from '@/lib/server/platform-guide';
import { PublicEventGuide } from '@/components/platform/public-guide';
import { ApiError } from '@/lib/server/http';
export const metadata: Metadata = { title: { absolute: 'Private event preview | Event Beast' }, robots: { index: false, follow: false } };
export default async function PreviewPage({ params }: { params: Promise<{ organizationSlug: string; eventId: string }> }) {
  const { organizationSlug, eventId } = await params;
  if (!uuid.safeParse(eventId).success) notFound();
  try { const guide = await previewPlatformGuide(organizationSlug, eventId); return <PublicEventGuide guide={guide} preview />; }
  catch (error) { if (error instanceof ApiError && error.status === 401) redirect(`/platform/auth?next=${encodeURIComponent(`/app/${organizationSlug}/events/${eventId}/preview`)}`); if (error instanceof ApiError && [403, 404].includes(error.status)) notFound(); throw error; }
}
