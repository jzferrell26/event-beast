import { lookupTables, demoResourceRows } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json } from "@/lib/server/http";
export const GET = () => handle(async () => {
  if (isDemo()) return json(Object.fromEntries(Object.entries(lookupTables).map(([table, field]) => [table, demoResourceRows(table).map((r) => ({ id: r.id, label: r[field], day_id: r.day_id }))])));
  const { db, event } = await requireAdmin();
  const results = await Promise.all(Object.entries(lookupTables).map(async ([table, field]) => {
    const result = await db.from(table).select(table === "agenda_sessions" ? `id,${field},day_id` : `id,${field}`).eq("event_id", event.id).order(field).limit(1000);
    databaseError(result.error);
    return [table, (result.data as unknown as Record<string, unknown>[] ?? []).map((r) => ({ id: r.id, label: r[field], day_id: r.day_id }))];
  }));
  return json(Object.fromEntries(results));
});
