import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app-provider";
import { SponsorShell } from "@/components/sponsor-workspace";
import { sponsorWorkspaceGuide } from "@/lib/server/sponsor";
import { ApiError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsor workspace" };
export default async function SponsorLayout({ children }: { children: React.ReactNode }) {
  let guide;
  try { guide = await sponsorWorkspaceGuide(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/auth?next=/sponsor");
    if (error instanceof ApiError && error.status === 403) redirect("/access");
    throw error;
  }
  return <AppProvider initialGuide={guide}><SponsorShell>{children}</SponsorShell></AppProvider>;
}
