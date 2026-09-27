import { ThreadScreen } from "@/components/inbox";
import { pageAccess } from "@/lib/server/auth";
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await pageAccess(`/inbox/${id}`); return <ThreadScreen key={id} id={id} />; }
