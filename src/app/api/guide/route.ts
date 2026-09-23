import { getGuide } from "@/lib/server/guide";
import { handle, json } from "@/lib/server/http";

export const GET = () => handle(async () => {
  const guide = await getGuide();
  if (!guide) return json({ error: "The event guide is not available yet." }, 503);
  return Response.json(guide, { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=20", "X-Event-Beast-Public": "guide-v1" } });
});
