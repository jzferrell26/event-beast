import { PersonDetail } from "@/components/people";
import { pageAccess } from "@/lib/server/auth";
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await pageAccess(`/people/${id}`); return <PersonDetail key={id} id={id} />; }
