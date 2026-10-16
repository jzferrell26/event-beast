import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { platformEnabled } from '@/lib/server/platform-auth';
import './platform.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'Event Beast | Your event workspace' }, description: 'Build, manage and publish your event with Event Beast.', applicationName: 'Event Beast', manifest: null, appleWebApp: { capable: false, title: 'Event Beast' }, icons: { icon: '/event-beast.svg', apple: '/event-beast.svg' }, openGraph: { title: 'Event Beast', description: 'Your event workspace.', siteName: 'Event Beast' }, twitter: { card: 'summary', title: 'Event Beast', description: 'Your event workspace.' } };
export default function PlatformLayout({ children }: { children: React.ReactNode }) { if (!platformEnabled()) notFound(); return children; }
