import { z } from "zod";
import { uuid } from "@/lib/validation";
import { sponsorPageSchema } from "@/lib/roles";
import { demoGuide } from "@/lib/demo";
import { requireSponsor } from "@/lib/server/auth";
import { isDemo, invalidatePublicGuide } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };
export const GET = (_: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  if (isDemo()) {
    if (id !== demoGuide.sponsors[1].id) throw new ApiError(403, "This sponsor page is not assigned to this demo account.");
    return json({ sponsor: { ...demoGuide.sponsors[1], content_version: 0 }, tiers: demoGuide.tiers });
  }
  const { db, event } = await requireSponsor(id);
  const [sponsor, tiers] = await Promise.all([
    db.from("sponsors").select("*").eq("event_id", event.id).eq("id", id).maybeSingle(),
    db.from("sponsor_tiers").select("*").eq("event_id", event.id),
  ]);
  databaseError(sponsor.error); databaseError(tiers.error);
  if (!sponsor.data) throw new ApiError(404, "Sponsor page not found.");
  return json({ sponsor: sponsor.data, tiers: tiers.data ?? [] });
});
export const PATCH = (request: Request, context: Context) => handle(async () => {
  const id = uuid.parse((await context.params).id);
  const body = await parseBody(request, z.object({ expected_version: z.number().int().nonnegative(), values: sponsorPageSchema }).strict());
  const { db, event } = await requireSponsor(id);
  const result = await db.rpc("save_sponsor_page", { p_event: event.id, p_sponsor: id, p_expected_version: body.expected_version, p_values: body.values });
  databaseError(result.error);
  invalidatePublicGuide();
  return json({ saved: true, sponsor: result.data });
});
