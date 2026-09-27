import { isDemo } from "@/lib/server/guide";
import { json } from "@/lib/server/http";
import { releaseInfo } from "@/lib/release-info";

export const dynamic = "force-dynamic";

/** Public release provenance only: no secrets, private counts or health claims. */
export function GET() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.EVENT_BEAST_RELEASE_SHA;
  return json(releaseInfo({ revision, demo: isDemo(), emailReady: process.env.EVENT_BEAST_EMAIL_READY === "true" }));
}
