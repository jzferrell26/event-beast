import { z } from "zod";
import { parseAttendeeCsv } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";
export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, z.object({ csv: z.string().max(1024 * 1024), commit: z.boolean(), previewToken: z.string().regex(/^[a-f0-9]{32}$/).optional() }).strict(), 1500000);
  if (!isDemo() || body.commit) {
    const actor = await requireAdmin();
    const parsed = parseAttendeeCsv(body.csv);
    if (parsed.errors.length) return json({ ...parsed, committed: false });
    if (!body.commit) {
      const result=await actor.db.rpc('preview_attendee_import',{p_event:actor.event.id,p_rows:parsed.rows});
      databaseError(result.error);return json({...parsed,summary:result.data,committed:false});
    }
    if (!body.previewToken) throw new ApiError(409,'Review the roster preview before importing. No changes were saved.');
    const result = await actor.db.rpc("commit_attendee_import", { p_event: actor.event.id, p_rows: parsed.rows, p_preview_token: body.previewToken });
    databaseError(result.error);
    return json({ ...result.data, committed: true });
  }
  return json({ ...parseAttendeeCsv(body.csv), committed: false, demo: true });
});
