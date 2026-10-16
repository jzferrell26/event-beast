import { Subscribe } from '@/components/platform/billing';
export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) { const query = await searchParams; return <Subscribe checkout={query.checkout} />; }
