import { SponsorDetail } from "@/components/more";
export default async function SponsorPage({ params }: { params: Promise<{ id: string }> }) { return <SponsorDetail id={(await params).id} />; }
