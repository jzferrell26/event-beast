import { CustomerWorkspace } from '@/components/platform/workspaces';
export default async function WorkspacePage({ params }: { params: Promise<{ organizationSlug: string }> }) { const { organizationSlug } = await params; return <CustomerWorkspace key={organizationSlug} slug={organizationSlug} />; }
