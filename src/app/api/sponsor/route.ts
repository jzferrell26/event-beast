import { demoGuide } from "@/lib/demo";
import { requireSponsor } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json } from "@/lib/server/http";

export const GET = () => handle(async () => {
  if (isDemo()) return json({ sponsors: [{ ...demoGuide.sponsors[1], content_version: 0 }], tiers: demoGuide.tiers });
  const { db, event, attendee, isAdmin } = await requireSponsor();
  let query = db.from("sponsors").select("*").eq("event_id", event.id).order("name");
  if (!isAdmin) {
    const assignments = await db.from("sponsor_editors").select("sponsor_id").eq("event_id", event.id).eq("attendee_id", attendee!.id);
    databaseError(assignments.error);
    const ids = (assignments.data ?? []).map((a) => a.sponsor_id);
    if (!ids.length) return json({ sponsors: [], tiers: [] });
    query = query.in("id", ids);
  }
  const [sponsors, tiers] = await Promise.all([query, db.from("sponsor_tiers").select("*").eq("event_id", event.id).order("sort_order")]);
  databaseError(sponsors.error); databaseError(tiers.error);
  return json({ sponsors: sponsors.data ?? [], tiers: tiers.data ?? [] });
});
