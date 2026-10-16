import { CustomerBilling } from '@/components/platform/billing';
export default async function BillingPage({ params }: { params: Promise<{ organizationSlug: string }> }) { const { organizationSlug } = await params; return <CustomerBilling key={organizationSlug} slug={organizationSlug} />; }
