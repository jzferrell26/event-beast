import { SponsorPageEditor } from "@/components/sponsor-workspace";
export default async function SponsorEditPage({ params }: { params: Promise<{ id: string }> }) { return <SponsorPageEditor key={(await params).id} id={(await params).id} />; }
