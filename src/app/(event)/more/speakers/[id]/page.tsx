import { SpeakerDetail } from '@/components/speakers';
export const metadata = { title: 'Speaker' };
export default async function SpeakerPage({ params }: { params: Promise<{ id: string }> }) { return <SpeakerDetail id={(await params).id} />; }
