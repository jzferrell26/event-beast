import { z } from "zod";
import { getAdminResource, resourceSchema } from "@/lib/admin-resources";
import { uuid } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo, invalidatePublicGuide } from "@/lib/server/guide";
import { demoResourceRows } from "@/lib/server/admin";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

type Context = { params: Promise<{ resource: string }> };
export const GET = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition) throw new ApiError(404, "This organizer section does not exist.");
  if (isDemo()) return json({ rows: demoResourceRows(resource), hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get("offset")) || 0, 10000));
  const result = await db.from(resource).select("*").eq("event_id", event.id).order(definition.order, { ascending: resource !== "announcements" }).range(offset, offset + 50);
  databaseError(result.error);
  let rows = (result.data ?? []).slice(0, 50);
  if (resource === 'agenda_sessions' && rows.length) {
    const notes = await db.from('agenda_import_notes').select('session_id,source_sheet,source_row,issue').eq('event_id', event.id).in('session_id', rows.map(row => row.id));
    databaseError(notes.error);
    rows = rows.map(row => ({ ...row, import_note: notes.data?.find(note => note.session_id === row.id) ?? null }));
  }
  return json({ rows, hasMore: (result.data?.length ?? 0) > 50 });
});
export const POST = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition) throw new ApiError(404, "This organizer section does not exist.");
  const body = await parseBody(request, z.object({ id: uuid.optional(), values: resourceSchema(definition) }).strict());
  const { db, event } = await requireAdmin();
  const query = definition.singleton
    ? db.from(resource).upsert({ ...body.values, event_id: event.id })
    : body.id ? db.from(resource).update(body.values).eq("event_id", event.id).eq("id", body.id)
    : db.from(resource).insert({ ...body.values, event_id: event.id });
  const result = await query.select(definition.singleton ? "event_id" : "id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This record was changed or removed. Refresh the section and try again.");
  invalidatePublicGuide();
  return json({ saved: true, record: result.data });
});
export const DELETE = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition || definition.singleton) throw new ApiError(400, "This section cannot be deleted.");
  const body = await parseBody(request, z.object({ id: uuid }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.from(resource).delete().eq("event_id", event.id).eq("id", body.id).select("id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This record has already been removed.");
  invalidatePublicGuide();
  return json({ deleted: true });
});
