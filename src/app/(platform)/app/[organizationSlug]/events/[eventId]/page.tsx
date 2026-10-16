import { EventWorkspace } from '@/components/platform/event-workspace';
export default async function EventPage({ params }: { params: Promise<{ organizationSlug: string; eventId: string }> }) { const { organizationSlug, eventId } = await params; return <EventWorkspace key={`${organizationSlug}:${eventId}`} organizationSlug={organizationSlug} eventId={eventId} />; }
