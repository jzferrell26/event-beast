import { z } from "zod";
import { parseAttendeeCsv } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ csv: z.string().max(1024 * 1024), commit: z.boolean() }).strict(), 1500000);
  if (!isDemo() || body.commit) {
    const actor = await requireAdmin();
    const parsed = parseAttendeeCsv(body.csv);
    if (parsed.errors.length || !body.commit) return json({ ...parsed, committed: false });
    const result = await actor.db.rpc("import_attendees", { p_event: actor.event.id, p_rows: parsed.rows });
    databaseError(result.error);
    return json({ ...result.data, committed: true });
  }
  return json({ ...parseAttendeeCsv(body.csv), committed: false, demo: true });
});
