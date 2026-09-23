import { notFound } from "next/navigation";
import { AdminContent, AdminAttendees, AdminReports } from "@/components/admin";
import { getAdminResource } from "@/lib/admin-resources";
export default async function AdminSectionPage({ params }: { params: Promise<{ resource: string }> }) { const { resource } = await params; if (resource === "attendees") return <AdminAttendees />; if (resource === "reports") return <AdminReports />; if (!getAdminResource(resource)) notFound(); return <AdminContent resource={resource} />; }
