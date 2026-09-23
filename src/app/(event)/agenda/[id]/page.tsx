import { SessionDetail } from "@/components/agenda";
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) { return <SessionDetail id={(await params).id} />; }
