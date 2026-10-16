import { PlatformAuth } from '@/components/platform/auth';
import { safeNext } from '@/lib/format';
export default async function PlatformSignIn({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string; error?: string }> }) { const query = await searchParams; return <PlatformAuth next={safeNext(query.next ?? '/app')} reset={query.mode === 'reset'} linkError={query.error === 'link'} />; }
